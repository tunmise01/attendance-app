import React, { useState, useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable'; // <-- CRITICAL FIX: Direct import
import {
  Camera,
  Printer,
  CheckCircle,
  User,
  BookOpen,
  X,
  ShieldAlert,
  AlertTriangle,
  LogOut,
  Settings,
  Edit3
} from 'lucide-react';
import './App.css';
import { DEPARTMENT_LIST } from './studentList';

const App = () => {
  // --- STATE MANAGEMENT ---
  
  // Load from local storage (so refresh doesn't kill data)
  const loadState = (key, defaultValue) => {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : defaultValue;
  };

  const [isAuthenticated, setIsAuthenticated] = useState(() => loadState('isAuthenticated', false));
  const [isSetupComplete, setIsSetupComplete] = useState(() => loadState('isSetupComplete', false));
  const [pinInput, setPinInput] = useState("");

  const [courseInfo, setCourseInfo] = useState(() => loadState('courseInfo', {
    department: "",
    courseCode: "",
    courseTitle: "Software Design Architecture",
    level: "",
    date: new Date().toLocaleDateString('en-GB')
  }));

  const [students, setStudents] = useState(() => loadState('students', 
    DEPARTMENT_LIST.map(student => ({
      ...student,
      status: "Absent",
      checkInTime: null
    }))
  ));

  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  
  const lastScannedRef = useRef(null);

  // --- SAVE DATA AUTOMATICALLY ---
  useEffect(() => {
    localStorage.setItem('isAuthenticated', JSON.stringify(isAuthenticated));
    localStorage.setItem('isSetupComplete', JSON.stringify(isSetupComplete));
    localStorage.setItem('courseInfo', JSON.stringify(courseInfo));
    localStorage.setItem('students', JSON.stringify(students));
  }, [isAuthenticated, isSetupComplete, courseInfo, students]);

// --- SCANNER SETUP ---
  useEffect(() => {
    let scanner;
    if (isScanning && isAuthenticated && isSetupComplete) {
      scanner = new Html5QrcodeScanner(
        "reader",
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
          rememberLastUsedCamera: true, // <--- THIS FIXES THE PERMISSION NAGGING
          videoConstraints: { facingMode: { exact: "environment" } }
        },
        false
      );
      scanner.render(onScanSuccess, (error) => {});
    }
    return () => {
      if (scanner) try { scanner.clear(); } catch (e) {}
    };
  }, [isScanning, isAuthenticated, isSetupComplete]);
  // --- ACTIONS ---

  const handleLogin = (e) => {
    e.preventDefault();
    if (pinInput === "2024/58434") {
      setIsAuthenticated(true);
    } else {
      alert("Incorrect PIN! Try Course Rep Matric.");
    }
  };

  const handleSetupComplete = () => {
    if (!courseInfo.courseCode || !courseInfo.level) {
      alert("Please fill in Course Code and Level.");
      return;
    }
    setIsSetupComplete(true);
    setIsScanning(true);
  };

  // --- NEW: LOGOUT & RESET ---
  const handleLogout = () => {
    if (window.confirm("Logging out will CLEAR all attendance data. Continue?")) {
      // 1. Wipe Local Storage
      localStorage.clear();
      
      // 2. Reset State manually
      setIsAuthenticated(false);
      setIsSetupComplete(false);
      setPinInput("");
      setStudents(DEPARTMENT_LIST.map(s => ({ ...s, status: "Absent", checkInTime: null })));
      setCourseInfo({
        department: "",
        courseCode: "",
        courseTitle: "Software engineering",
        level: "",
        date: new Date().toLocaleDateString('en-GB')
      });
    }
  };

const handleAttendance = (matric) => {
    // 1. Find the student
    const studentIndex = students.findIndex(s => s.matric === matric);

    if (studentIndex !== -1) {
      const student = students[studentIndex];

      // 2. CHECK IF ALREADY PRESENT (The Duplicate Fix)
      if (student.status === "Present") {
        showStatus("error", `⚠️ ${student.name} is already checked in!`);
        return; // <--- STOP HERE. Do not update state.
      }

      // 3. If not present, mark them present
      const now = new Date();
      const timeString = `${now.toLocaleTimeString('en-GB')} ${now.toLocaleDateString('en-GB')}`;
      
      const updatedStudents = [...students];
      updatedStudents[studentIndex] = {
        ...student,
        status: "Present",
        checkInTime: timeString
      };
      
      setStudents(updatedStudents);
      showStatus("success", `✅ ${student.name} Checked In!`);

    } else {
      // 4. Student not found in database
      showStatus("error", `❌ ID: ${matric} not found.`);
    }
  };

  const onScanSuccess = (decodedText) => {
    const matric = decodedText.trim();
    if (lastScannedRef.current === matric) return;
    lastScannedRef.current = matric;
    setTimeout(() => { lastScannedRef.current = null; }, 3000);
    handleAttendance(matric);
  };

  const showStatus = (type, message) => {
    setScanStatus(type);
    setStatusMessage(message);
    setTimeout(() => { setScanStatus(null); setStatusMessage(null); }, 3000);
  };

  // --- PDF EXPORT (UPDATED) ---
  const generatePDF = () => {
    const doc = new jsPDF();

    // Header
    doc.setFontSize(16);
    doc.setTextColor(22, 163, 74);
    doc.text("UNIVERSITY OF OSUN", 105, 15, { align: "center" });
    
    // Details
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text(`Department: ${courseInfo.department}`, 14, 25);
    doc.text(`Course: ${courseInfo.courseCode}`, 14, 32);
    doc.text(`Level: ${courseInfo.level}`, 14, 39);
    doc.text(`Date: ${courseInfo.date}`, 150, 25);
    
    // Stats
    const presentCount = students.filter(s => s.status === "Present").length;
    doc.text(`Total Students: ${students.length}`, 14, 48);
    doc.text(`Present: ${presentCount}`, 80, 48);
    doc.text(`Absent: ${students.length - presentCount}`, 150, 48);

    // Table
    const tableRows = students.map((s, i) => [
      i + 1,
      s.name,
      s.matric,
      s.status,
      s.checkInTime || "-"
    ]);

    autoTable(doc, {
      head: [["S/N", "Name", "Matric", "Status", "Time"]],
      body: tableRows,
      startY: 55,
      theme: 'grid',
      headStyles: { fillColor: [22, 163, 74] }
    });

    doc.save(`${courseInfo.courseCode}_Attendance.pdf`);
  };

  // --- RENDER ---
  if (!isAuthenticated) {
    return (
      <div className="login-container">
        <div className="login-card">
          <BookOpen size={48} className="login-icon" />
          <h2>Course Rep Login</h2>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              placeholder="Enter Course Rep Matric"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              className="login-input"
            />
            <button type="submit" className="btn-login">Access Dashboard</button>
          </form>
        </div>
      </div>
    );
  }

  if (!isSetupComplete) {
    return (
      <div className="app-container setup-mode">
        <div className="setup-card">
          <div className="setup-header">
            <Settings size={28} color="#16a34a" />
            <h2>Class Setup</h2>
          </div>
          <div className="form-group">
            <label>Department</label>
            <input value={courseInfo.department} onChange={(e) => setCourseInfo({...courseInfo, department: e.target.value})} className="setup-input" placeholder="Software Engineering" />
          </div>
          <div className="form-group">
            <label>Course Code</label>
            <input value={courseInfo.courseCode} onChange={(e) => setCourseInfo({...courseInfo, courseCode: e.target.value})} className="setup-input" placeholder="SEN 211" />
          </div>
          <div className="form-group">
            <label>Level</label>
            <input value={courseInfo.level} onChange={(e) => setCourseInfo({...courseInfo, level: e.target.value})} className="setup-input" placeholder="200 Level" />
          </div>
          <button className="btn-start-attendance" onClick={handleSetupComplete}>Start Attendance</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="header">
        <div className="brand">
          <BookOpen className="icon" size={28} />
          <div>
            <h1>{courseInfo.courseCode}</h1>
            <p className="subtitle">{courseInfo.level}</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn-icon-only" onClick={() => setIsSetupComplete(false)}><Edit3 size={20}/></button>
          <button className="btn-icon-only" onClick={handleLogout}><LogOut size={20}/></button>
        </div>
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">Total</span>
          <span className="stat-value">{students.length}</span>
        </div>
        <div className="stat-card highlight">
          <span className="stat-label">Present</span>
          <span className="stat-value">{students.filter(s => s.status === "Present").length}</span>
        </div>
      </div>

      <div className="controls">
        {!isScanning ? (
          <button className="btn btn-primary btn-scan" onClick={() => setIsScanning(true)}><Camera size={20}/> Scan ID</button>
        ) : (
          <button className="btn btn-danger btn-scan" onClick={() => setIsScanning(false)}><X size={20}/> Stop Camera</button>
        )}
        <button className="btn btn-secondary btn-pdf" onClick={generatePDF}><Printer size={20}/> PDF</button>
      </div>

      {isScanning && <div className="scanner-container"><div id="reader"></div></div>}
      {scanStatus && <div className={`status-banner ${scanStatus}`}>{statusMessage}</div>}

      <div className="list-container">
        <div className="list-header"><span>Student</span><span>Status</span></div>
        <div className="list-body">
          {students.map((student) => (
            <div key={student.id} className={`student-row ${student.status.toLowerCase()}`}>
              <div className="student-info">
                <div className="avatar"><User size={20}/></div>
                <div><p className="name">{student.name}</p><p className="matric">{student.matric}</p></div>
              </div>
              <div className="student-status-right">
                <div className={`status-pill ${student.status.toLowerCase()}`}>{student.status}</div>
                {student.status === "Present" && <small className="checkin-time">{student.checkInTime}</small>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default App;