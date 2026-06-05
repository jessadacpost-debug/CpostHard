import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard, Layers, Users, Clock, Flame, CheckCircle2, Plus, 
  Settings as SettingsIcon, Activity, ArrowRight, Info, Calendar, 
  AlertTriangle, History, Check, Eye, FileText, UserCheck, Wrench, 
  Grid, X, Archive, RefreshCw, FolderMinus, ArrowUpRight, Trash2, 
  ListTodo, ChevronDown, ChevronUp, Sparkles, Lock, Mail, UserPlus, 
  KeyRound, LogOut, Spline, Search, User, Sliders
} from 'lucide-react';
// --- นำเข้า Library สำหรับปฏิทิน และ Drag & Drop ---
import { Calendar as BigCalendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import withDragAndDrop from 'react-big-calendar/lib/addons/dragAndDrop'; // เพิ่ม Drag & Drop
import format from 'date-fns/format';
import parse from 'date-fns/parse';
import startOfWeek from 'date-fns/startOfWeek';
import getDay from 'date-fns/getDay';
import th from 'date-fns/locale/th';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'; // สไตล์ของลากวาง

const locales = { 'th': th };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

// หุ้มปฏิทินด้วยฟังก์ชันลากวาง
const DnDCalendar = withDragAndDrop(BigCalendar);

// Prefer same-origin API so Vite proxy and backend-served frontend both work.
// Override with VITE_API_BASE only when frontend is hosted separately.
const API_BASE = import.meta.env.VITE_API_BASE || '/api';

const COMPLETED_STATUSES = new Set(['มีแบบ Shop แล้ว', 'ออกของแล้ว']);
const READY_FOR_SHOP_STATUS = 'พร้อมทำ Shop';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const parseFloorSortValue = (name) => {
  const match = String(name || '').match(/(\d+)/);
  return match ? parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
};

const compareFloorZones = (a, b) => {
  const aNum = parseFloorSortValue(a.name);
  const bNum = parseFloorSortValue(b.name);
  if (aNum !== bNum) return aNum - bNum;
  return String(a.name || '').localeCompare(String(b.name || ''), undefined, {
    numeric: true,
    sensitivity: 'base'
  });
};

// เพิ่มตัวแปร isAutoExpand เพื่อเลือกว่าจะขยายหรือไม่
const expandFloorInput = (rawText, isAutoExpand = true) => {
  const items = String(rawText || '').split(',').map(item => item.trim()).filter(Boolean);
  const expanded = [];
  items.forEach(item => {
    if (isAutoExpand) {
      const rangeMatch = item.match(/^(\d+)\s*-\s*(\d+)$/);
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1], 10);
        const end = parseInt(rangeMatch[2], 10);
        const step = start <= end ? 1 : -1;
        for (let n = start; step > 0 ? n <= end : n >= end; n += step) expanded.push(String(n));
        return;
      }
    }
    expanded.push(item);
  });
  return expanded;
};

const STATUS_FLOW = [
  'รอ Framing',
  'มีการ Revise',
  'พร้อมทำ Shop',
  'กำลังทำ Shop',
  'มีแบบ Shop แล้ว',
  'ออกของแล้ว'
];

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('syncdraft_token') || null);
  const [currentUser, setCurrentUser] = useState(
    localStorage.getItem('syncdraft_user') ? JSON.parse(localStorage.getItem('syncdraft_user')) : null
  );
  // --- State สำหรับระบบ Filter ในหน้า Workspace (ข้อ 4) ---
  const [wsSearch, setWsSearch] = useState('');
  const [wsFilterEng, setWsFilterEng] = useState('ALL');
  const [wsFilterDraft, setWsFilterDraft] = useState('ALL');
  const [wsFilterStatus, setWsFilterStatus] = useState('ALL');

  // --- State สำหรับเปิดหน้าต่าง Modal ดูรายละเอียดปฏิทิน (ข้อ 3) ---
  const [selectedEvent, setSelectedEvent] = useState(null);

  // --- ฟังก์ชันย่อชื่อดร๊าฟ (ข้อ 2) ---
  const getInitials = (name) => {
    if (!name) return '??';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}.${parts[1][0]}`;
    return name.substring(0, 2);
  };

  // --- State สำหรับ Filter ในหน้าปฏิทิน ---
  const [calendarFilterEng, setCalendarFilterEng] = useState('ALL');
  const [calendarFilterDraft, setCalendarFilterDraft] = useState('ALL');

  // --- ฟังก์ชันจัดการเมื่อมีการลาก-วาง (Drag & Drop) บนปฏิทิน ---
  const handleEventDrop = async ({ event, start, end, resourceId }) => {
    const projIndex = projects.findIndex(p => p.id === event.projectId);
    if (projIndex === -1) return;

    const zoneIndex = projects[projIndex].floorZones.findIndex(fz => fz.id === event.zoneId);
    if (zoneIndex === -1) return;

    // 🌟 แก้บั๊กวันที่คลาดเคลื่อน (ชดเชยเวลา Timezone ของไทย เพื่อไม่ให้วันที่โดนปัดลง)
    const localDate = new Date(start.getTime() - (start.getTimezoneOffset() * 60000))
      .toISOString().split('T')[0];

    const updatedProjects = [...projects];
    updatedProjects[projIndex].floorZones[zoneIndex] = {
      ...updatedProjects[projIndex].floorZones[zoneIndex],
      deadline: localDate, // ใช้วันที่ที่ชดเชยเวลาแล้ว
      assignedDraftId: resourceId || updatedProjects[projIndex].floorZones[zoneIndex].assignedDraftId
    };

    setProjects(updatedProjects);
  };

  // Core States
  const [activeTab, setActiveTab] = useState('workspace'); // 'workspace', 'dashboard', 'recovery', 'admin'
  const [projects, setProjects] = useState([]);
  const [archivedData, setArchivedData] = useState({ archivedProjects: [], softDeletedFloors: [] });
  const [users, setUsers] = useState([]);
  const [dashboardData, setDashboardData] = useState({ stats: {}, draftWorkloads: [], engineerWorkloads: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Login Form States
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Dynamic Workload settings
  const [workloadConfig, setWorkloadConfig] = useState({
    hoursPerSheet: 1.5,
    maxSheetsThreshold: 5,
    warningDaysThreshold: 2
  });

  // Admin Dashboard States
  const [adminSubTab, setAdminSubTab] = useState('users'); // 'users', 'workload'
  const [adminUsersList, setAdminUsersList] = useState([]);
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState(null);

  // User Form States (Create/Edit)
  const [userFormName, setUserFormName] = useState('');
  const [userFormEmail, setUserFormEmail] = useState('');
  const [userFormRole, setUserFormRole] = useState('engineer');
  const [userFormPassword, setUserFormPassword] = useState('');

  // Filters
  const [filterOnlyMyWork, setFilterOnlyMyWork] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  // Accordion open/close state for projects (ช่วยให้เปิด/ปิดแสดงผลแบบย่อ รองรับ 20+ โครงการ)
  const [openProjectAccordions, setOpenProjectAccordions] = useState({});

  // Modals & Panels
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [isFloorEditOpen, setIsFloorEditOpen] = useState(false);
  const [selectedFloor, setSelectedFloor] = useState(null);
  const [floorHistory, setFloorHistory] = useState([]);

  // Inline Quick Add Floor
  const [quickFloorName, setQuickFloorName] = useState({});
  const [quickFloorDeadline, setQuickFloorDeadline] = useState({});

  // Create Project Form
  const [newProjectNumber, setNewProjectNumber] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newEngineerId, setNewEngineerId] = useState('');
  const [newDraftId, setNewDraftId] = useState('');
  const [newProjectNotes, setNewProjectNotes] = useState('');
  const [newFloorInputText, setNewFloorInputText] = useState('');
  const [defaultDeadline, setDefaultDeadline] = useState('');
  const [autoExpandFloors, setAutoExpandFloors] = useState(true);
  const [customHolidays, setCustomHolidays] = useState(() => {
    const saved = localStorage.getItem('syncdraft_holidays');
    return saved ? JSON.parse(saved) : [];
  });

  const toggleHoliday = (dateStr) => {
    if (currentUser?.role === 'draft') return alert('วิศวกรหรือแอดมินเท่านั้นที่กำหนดวันหยุดได้ครับ');
    const updated = customHolidays.includes(dateStr)
      ? customHolidays.filter(d => d !== dateStr)
      : [...customHolidays, dateStr];
    setCustomHolidays(updated);
    localStorage.setItem('syncdraft_holidays', JSON.stringify(updated));
  };

  // Floor Edit Form
  const [editFloorName, setEditFloorName] = useState('');
  const [editFloorDeadline, setEditFloorDeadline] = useState('');
  const [editFloorStatus, setEditFloorStatus] = useState('รอ Framing');
  const [editFloorNotes, setEditFloorNotes] = useState('');
  const [editAssignedDraftId, setEditAssignedDraftId] = useState('');
  const [editFloorProjectDraftId, setEditFloorProjectDraftId] = useState('');

  // Workload settings form
  const [cfgHoursPerSheet, setCfgHoursPerSheet] = useState(1.5);
  const [cfgMaxSheets, setCfgMaxSheets] = useState(5);
  const [cfgWarningDays, setCfgWarningDays] = useState(2);

  const getAuthHeaders = (authToken = token) => {
    return {
      'Content-Type': 'application/json',
      'Authorization': authToken ? `Bearer ${authToken}` : ''
    };
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) {
      setLoginError('กรุณากรอกอีเมลและรหัสผ่าน');
      return;
    }
    setIsLoggingIn(true);
    setLoginError('');
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'การเข้าสู่ระบบล้มเหลว');
      }

      localStorage.setItem('syncdraft_token', data.token);
      localStorage.setItem('syncdraft_user', JSON.stringify(data.user));
      setCurrentUser(data.user);
      setToken(data.token);
      setLoginError('');
      setLoginEmail('');
      setLoginPassword('');
      // Use the fresh token immediately; React state updates are async.
      await fetchData(data.user, data.token);
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('syncdraft_token');
    localStorage.removeItem('syncdraft_user');
    setToken(null);
    setCurrentUser(null);
    setActiveTab('workspace');
  };

  const fetchData = async (userOverride, tokenOverride) => {
    const activeUser = userOverride || currentUser;
    const authToken = tokenOverride || token;
    if (!authToken) return;
    setIsLoading(true);
    try {
      // 1. Fetch Users
      const usersRes = await fetch(`${API_BASE}/users`, { headers: getAuthHeaders(authToken) });
      if (!usersRes.ok) {
        if (usersRes.status === 401) {
          handleLogout();
          return;
        }
        throw new Error('Offline or Session expired');
      }
      const usersData = await usersRes.json();
      setUsers(usersData);

      // 2. Fetch Projects
      const projRes = await fetch(`${API_BASE}/projects`, { headers: getAuthHeaders(authToken) });
      const projData = await projRes.json();
      setProjects(projData);

      // Pre-fill accordion state to have first project open by default
      if (projData.length > 0 && Object.keys(openProjectAccordions).length === 0) {
        const initialAccordions = {};
        projData.forEach(p => {
          initialAccordions[p.id] = true;
        });
        setOpenProjectAccordions(initialAccordions);
      }

      // 3. Fetch Restoration Data
      const archivedRes = await fetch(`${API_BASE}/projects/archived`, { headers: getAuthHeaders(authToken) });
      const archData = await archivedRes.json();
      setArchivedData(archData);

      // 4. Fetch Dashboard stats
      const dashRes = await fetch(`${API_BASE}/dashboard`, { headers: getAuthHeaders(authToken) });
      const dashData = await dashRes.json();
      setDashboardData(dashData);

      // 5. Fetch Settings
      const settingsRes = await fetch(`${API_BASE}/settings`, { headers: getAuthHeaders(authToken) });
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        setWorkloadConfig(settingsData);
        setCfgHoursPerSheet(settingsData.hoursPerSheet);
        setCfgMaxSheets(settingsData.maxSheetsThreshold);
        setCfgWarningDays(settingsData.warningDaysThreshold);
      }

      // 6. If Admin, fetch full users list for Admin CRUD
      if (activeUser && activeUser.role === 'admin') {
        const adminUsersRes = await fetch(`${API_BASE}/admin/users`, { headers: getAuthHeaders(authToken) });
        if (adminUsersRes.ok) {
          const adminUsersData = await adminUsersRes.json();
          setAdminUsersList(adminUsersData);
        }
      }

      setError(null);
    } catch (err) {
      console.error(err);
      setError('Connection offline or authorization expired.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Only auto-fetch on mount if token already existed (page refresh)
    // After login, fetchData is called directly with userOverride instead
    if (token && currentUser) {
      fetchData(currentUser, token);
    }
  }, []);

  useEffect(() => {
    document.title = 'Cpost Hard';
  }, []);

  // Toggle Project Accordion (สำหรับจัดการ 20+ โครงการ)
  const toggleAccordion = (projectId) => {
    setOpenProjectAccordions(prev => ({
      ...prev,
      [projectId]: !prev[projectId]
    }));
  };

  // Toggle All Accordions
  const toggleAllAccordions = (open) => {
    const next = {};
    projects.forEach(p => {
      next[p.id] = open;
    });
    setOpenProjectAccordions(next);
  };

  // Handle Project Creation
  const handleCreateProject = async (e) => {
    e.preventDefault();
    const resolvedEngineerId = currentUser?.role === 'engineer' ? currentUser.id : parseInt(newEngineerId);
    if (!newProjectNumber || !newProjectName || !resolvedEngineerId || !newDraftId) {
      alert('Please fill out all required fields.');
      return;
    }

    const floorsArray = expandFloorInput(newFloorInputText, autoExpandFloors).map(name => ({ name, sheetCount: 1, deadline: defaultDeadline || '', notes: '', assignedDraftId: parseInt(newDraftId, 10) }));

    if (floorsArray.length === 0) {
      alert('กรุณาระบุชั้นงานอย่างน้อย 1 รายการ');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/projects`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          projectNumber: newProjectNumber,
          projectName: newProjectName,
          engineerId: resolvedEngineerId,
          draftId: parseInt(newDraftId),
          notes: newProjectNotes,
          floorZones: floorsArray
        })
      });

      if (!response.ok) throw new Error('Failed to create project');
      setIsCreateProjectOpen(false);
      setNewProjectNumber('');
      setNewProjectName('');
      setNewProjectNotes('');
      setNewFloorInputText('');
      setDefaultDeadline('');
      await fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Add Floor Inline
  const handleQuickAddFloor = async (projectId) => {
    const name = quickFloorName[projectId] || 'Floor New';
    const project = projects.find(p => p.id === projectId);
    const assignedDraftId = project?.draftId || null;

    try {
      const response = await fetch(`${API_BASE}/projects/${projectId}/floor-zones`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name,
          sheetCount: 1, // 1 ชั้น = 1 แผ่นเสมอ
          deadline: '',
          notes: '',
          assignedDraftId
        })
      });

      if (!response.ok) throw new Error('Failed to add Floor');
      setQuickFloorName({ ...quickFloorName, [projectId]: '' });
      setQuickFloorDeadline({ ...quickFloorDeadline, [projectId]: '' });
      await fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Soft Delete Floor Zone (ปุ่มลบชั้นโซนแบบดึงกลับได้)
  const handleSoftDeleteFloorZone = async (floorId, e) => {
    if (e) e.stopPropagation();
    if (!confirm('Are you sure you want to remove this floor zone card? You can pull it back from the Restoration Desk.')) return;
    try {
      const response = await fetch(`${API_BASE}/floor-zones/${floorId}/delete`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          isDeleted: true
        })
      });
      if (!response.ok) throw new Error('Delete failed.');
      setIsFloorEditOpen(false);
      await fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Restore Soft Deleted Floor
  const handleRestoreFloor = async (floorId) => {
    try {
      const response = await fetch(`${API_BASE}/floor-zones/${floorId}/delete`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          isDeleted: false
        })
      });
      if (!response.ok) throw new Error('Restore failed.');
      await fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Archive Project (จบโครงการ)
  const handleArchiveProject = async (projectId, e) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to finish and archive this project? It will be removed from your active workspace.')) return;
    try {
      const response = await fetch(`${API_BASE}/projects/${projectId}/archive`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ isArchived: true })
      });
      if (!response.ok) throw new Error('Archive failed.');
      await fetchData();
      setActiveTab('workspace');
    } catch (err) {
      alert(err.message);
    }
  };

  // Restore Project
  const handleRestoreProject = async (projectId) => {
    try {
      const response = await fetch(`${API_BASE}/projects/${projectId}/archive`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ isArchived: false })
      });
      if (!response.ok) throw new Error('Restore failed.');
      await fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Delete Project Completely (ปุ่มลบโครงการแบบ Cascade)
  const handleDeleteProject = async (projectId, e) => {
    e.stopPropagation();
    if (!confirm('⚠️ คำเตือน: คุณแน่ใจหรือไม่ว่าต้องการ "ลบโครงการนี้ออกอย่างถาวร"? การลบนี้จะล้างข้อมูลชั้นโซนและประวัติการบันทึกทั้งหมดทันทีโดยไม่สามารถกู้คืนได้!')) return;
    try {
      const response = await fetch(`${API_BASE}/projects/${projectId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'ลบโครงการล้มเหลว');
      }
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Update Floor parameters
  const handleUpdateFloorZone = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_BASE}/floor-zones/${selectedFloor.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: editFloorName,
          sheetCount: 1, // 1 ชั้น = 1 แผ่นเสมอ
          deadline: editFloorDeadline || null,
          status: editFloorStatus,
          notes: currentUser?.role === 'draft' ? selectedFloor.notes : editFloorNotes,
          assignedDraftId: editAssignedDraftId || selectedFloor.assignedDraftId || editFloorProjectDraftId || null
        })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Update failed.');
      }
      setIsFloorEditOpen(false);
      await fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Quick Draft Complete Action
  const handleDraftComplete = async (floorId, e) => {
    e.stopPropagation();
    try {
      const response = await fetch(`${API_BASE}/floor-zones/${floorId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          status: 'มีแบบ Shop แล้ว'
        })
      });
      if (!response.ok) throw new Error('Action failed.');
      await fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Batch Release: เปลี่ยนสถานะทั้งหมดที่เป็น "มีแบบ Shop แล้ว" => "ออกของแล้ว"
  const handleBatchRelease = async (projectId, e) => {
    e.stopPropagation();
    const proj = projects.find(p => p.id === projectId);
    if (!proj) return;

    const floorsToRelease = proj.floorZones ? proj.floorZones.filter(fz => fz.status === 'มีแบบ Shop แล้ว') : [];
    if (floorsToRelease.length === 0) {
      alert('ไม่มีชั้นงานใดที่เป็นสถานะ "มีแบบ Shop แล้ว" เพื่อสั่งออกของในขณะนี้');
      return;
    }

    if (!confirm(`ยืนยันสั่งออกของ (Batch Release) จำนวน ${floorsToRelease.length} ชั้นงานพร้อมกันทีเดียว?`)) return;

    try {
      for (const fz of floorsToRelease) {
        await fetch(`${API_BASE}/floor-zones/${fz.id}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            status: 'ออกของแล้ว'
          })
        });
      }
      fetchData();
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการสั่งออกของแบบกลุ่ม: ' + err.message);
    }
  };

  // ADMIN CRUDS: Users & Settings
  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!userFormName || !userFormEmail || !userFormPassword || !userFormRole) {
      alert('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/admin/users`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: userFormName,
          email: userFormEmail,
          role: userFormRole,
          password: userFormPassword
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'สร้างผู้ใช้งานล้มเหลว');

      setIsCreateUserOpen(false);
      setUserFormName('');
      setUserFormEmail('');
      setUserFormRole('engineer');
      setUserFormPassword('');
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleEditUserSubmit = async (e) => {
    e.preventDefault();
    if (!userFormName || !userFormEmail || !userFormRole) {
      alert('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }
    try {
      const body = {
        name: userFormName,
        email: userFormEmail,
        role: userFormRole
      };
      if (userFormPassword) {
        body.password = userFormPassword;
      }

      const res = await fetch(`${API_BASE}/admin/users/${selectedUserForEdit.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'แก้ไขผู้ใช้งานล้มเหลว');

      setIsEditUserOpen(false);
      setSelectedUserForEdit(null);
      setUserFormName('');
      setUserFormEmail('');
      setUserFormPassword('');
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!confirm('⚠️ คำเตือน: คุณต้องการลบผู้ใช้งานนี้ออกจากระบบใช่หรือไม่? ข้อมูลโปรไฟล์จะถูกลบออกทั้งหมด')) return;
    try {
      const res = await fetch(`${API_BASE}/admin/users/${userId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ลบผู้ใช้งานล้มเหลว');
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/settings`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          hoursPerSheet: parseFloat(cfgHoursPerSheet),
          maxSheetsThreshold: parseInt(cfgMaxSheets),
          warningDaysThreshold: parseInt(cfgWarningDays)
        })
      });
      if (!res.ok) throw new Error('บันทึกการตั้งค่าล้มเหลว');
      alert('บันทึกการตั้งค่า Workload เรียบร้อยแล้ว!');
      fetchData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Filter project workspace according to CURRENT authenticated user and workspace filters
  const activeProjectsFiltered = projects.filter(proj => {
    if (proj.isArchived) return false;

    // กรองตาม Role (เมื่อเลือกแสดงเฉพาะงานของฉัน)
    if (filterOnlyMyWork && currentUser && currentUser.role !== 'admin') {
      if (currentUser.role === 'engineer' && proj.engineerId !== currentUser.id) return false;
      if (currentUser.role === 'draft') {
        const hasMyAssignedFloor = proj.floorZones?.some(fz => (fz.assignedDraftId || proj.draftId) === currentUser.id);
        if (proj.draftId !== currentUser.id && !hasMyAssignedFloor) return false;
      }
    }

    // กรอง Search (เลขโครงการ หรือ ชื่อโครงการ)
    const searchMatch = !wsSearch ||
      proj.projectNumber.toLowerCase().includes(wsSearch.toLowerCase()) ||
      (proj.projectName && proj.projectName.toLowerCase().includes(wsSearch.toLowerCase()));
    if (!searchMatch) return false;

    // กรองวิศวกร
    if (wsFilterEng !== 'ALL' && proj.engineerId !== parseInt(wsFilterEng)) return false;

    // กรองดร๊าฟ & สถานะ
    if (wsFilterDraft !== 'ALL' || wsFilterStatus !== 'ALL') {
      const zoneMatch = proj.floorZones?.some(fz => {
        const draftMatch = wsFilterDraft === 'ALL' || (fz.assignedDraftId || proj.draftId) === parseInt(wsFilterDraft);
        const statusMatch = wsFilterStatus === 'ALL' || fz.status === wsFilterStatus;
        return draftMatch && statusMatch;
      });
      if (!zoneMatch) return false;
    }

    return true;
  });

  // Client-side delay risk calculator (mirrors server logic)
  const getDelayRisk = (fz) => {
    if (COMPLETED_STATUSES.has(fz.status) || !fz.deadline) return 'Normal';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadline = new Date(fz.deadline);
    deadline.setHours(0, 0, 0, 0);
    if (today > deadline) return 'OVERDUE';
    const diffDays = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
    if (diffDays <= workloadConfig.warningDaysThreshold) return 'RISK';
    return 'Normal';
  };

  // Open Floor Editor modal and fetch audit history
  const openFloorEditor = async (fz, proj = null) => {
    setSelectedFloor(fz);
    setEditFloorName(fz.name);
    setEditFloorDeadline(fz.deadline || '');
    setEditFloorStatus(fz.status);
    setEditFloorNotes(fz.notes || '');
    setEditFloorProjectDraftId(proj?.draftId ? String(proj.draftId) : '');
    setEditAssignedDraftId(fz.assignedDraftId ? String(fz.assignedDraftId) : String(proj?.draftId || ''));
    setIsFloorEditOpen(true);
    try {
      const res = await fetch(`${API_BASE}/floor-zones/${fz.id}/history`, { headers: getAuthHeaders() });
      if (res.ok) {
        const logs = await res.json();
        setFloorHistory(logs);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
      setFloorHistory([]);
    }
  };

  // GENERATE DRAFT'S SORTED CHECKLIST TODO LIST (เรียงลำดับงานตามความเสี่ยงและ Deadline เพื่อเป็นไกด์ให้ดร๊าฟ)
  const getDraftChecklist = () => {
    if (!currentUser || currentUser.role !== 'draft') return [];

    const urgentList = [];
    const readyList = [];
    projects
      .filter(p => !p.isArchived)
      .forEach(p => {
        if (p.floorZones) {
          p.floorZones.forEach(fz => {
            const ownerDraftId = fz.assignedDraftId || p.draftId;
            if (ownerDraftId !== currentUser.id) return;

            const risk = getDelayRisk(fz);
            const baseTask = {
              ...fz,
              projectNumber: p.projectNumber,
              projectName: p.projectName,
              delayRisk: risk
            };

            if ((fz.deadline && new Date(fz.deadline) - new Date() <= SEVEN_DAYS_MS) || risk === 'OVERDUE') {
              urgentList.push({
                ...baseTask,
                weight: risk === 'OVERDUE' ? 100 : 50
              });
            } else if (fz.status === READY_FOR_SHOP_STATUS) {
              readyList.push({
                ...baseTask,
                weight: 10
              });
            }
          });
        }
      });

    const source = urgentList.length > 0 ? urgentList : readyList;
    return source.sort((a, b) => {
      if (b.weight !== a.weight) return b.weight - a.weight;
      return new Date(a.deadline || '2999-12-31') - new Date(b.deadline || '2999-12-31');
    });
  };

  const draftChecklistData = getDraftChecklist();

  // Find Draft with the absolute lowest active sheet workload to recommend
  const getRecommendedDraft = () => {
    if (dashboardData.draftWorkloads.length === 0) return null;
    const sorted = [...dashboardData.draftWorkloads].sort((a, b) => a.estimatedHours - b.estimatedHours);
    return sorted[0];
  };

  const recommendedDraft = getRecommendedDraft();

  // Auto stress workload warning matrix for the logged-in draftsperson
  const getMyStressWarning = () => {
    if (!currentUser || currentUser.role !== 'draft' || !dashboardData.draftWorkloads) return null;
    const myWorkload = dashboardData.draftWorkloads.find(d => d.id === currentUser.id);
    if (!myWorkload) return null;

    // Check if the current draftsperson has > maxSheetsThreshold active floors (1 floor = 1 sheet)
    if (myWorkload.activeFloors > workloadConfig.maxSheetsThreshold) {
      return `⚠️ แจ้งเตือนสภาวะงานล้นมือ: ขณะนี้คุณมีปริมาณชั้นงานค้างรวมกัน ${myWorkload.activeFloors} ชั้น (ซึ่งเกินกว่าค่าเฉลี่ยควบคุม ${workloadConfig.maxSheetsThreshold} ชั้น) โปรดวางแผนบริหารจัดการ หรือปรึกษาวิศวกรเพื่อกระจายปริมาณงานอย่างสมดุล`;
    }
    return null;
  };

  const myStressWarningMessage = getMyStressWarning();

  // Color helper class for card layouts
  const getStatusStyle = (st) => {
    switch (st) {
      case 'รอ Framing': return 's-waiting border-slate-700 bg-slate-800/30 text-slate-300';
      case 'มีการ Revise': return 's-revise border-rose-500/35 bg-rose-500/5 text-rose-300';
      case 'พร้อมทำ Shop': return 's-ready border-cyan-500/35 bg-cyan-500/5 text-cyan-300';
      case 'กำลังทำ Shop': return 's-working border-amber-500/35 bg-amber-500/5 text-amber-300';
      case 'มีแบบ Shop แล้ว': return 's-done border-emerald-500/35 bg-emerald-500/5 text-emerald-300';
      case 'ออกของแล้ว': return 's-released border-purple-500/35 bg-purple-500/5 text-purple-300';
      default: return 'border-slate-800 bg-slate-900/40 text-slate-400';
    }
  };
  const calculateDraftProjectsCount = (draftId) => {
    let count = 0;
    projects.filter(p => !p.isArchived).forEach(p => {
      const hasWork = p.floorZones?.some(fz => fz.deadline && !COMPLETED_STATUSES.has(fz.status) && (fz.assignedDraftId || p.draftId) === draftId);
      if (hasWork) count++;
    });
    return count;
  };

  const ganttDates = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 2 + i); // ย้อนหลัง 2 วัน ล่วงหน้า 11 วัน
    return d;
  });

  // If NOT authenticated, render the login view
  if (!token) {
    return (
      <div className="min-height-screen w-full flex items-center justify-center bg-[#0b0f19] px-4 py-20 font-sans" style={{ minHeight: '100vh' }}>
        <div className="w-full max-w-md glass-panel p-8 rounded-2xl border border-slate-800 shadow-2xl animate-scaleUp">

          <div className="text-center mb-8">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-brand-600 to-cyan-400 flex items-center justify-center font-bold text-2xl text-white shadow-lg shadow-brand-500/20 mb-4 animate-pulse-dot">
              ⚡
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-white to-brand-400 bg-clip-text text-transparent">
              Cpost Hard
            </h1>
            <p className="text-xs text-slate-400 mt-2 font-medium">
              ระบบจัดคิวงาน Shop Drawing และควบคุม Workload วิศวกร-ดร๊าฟ
            </p>
          </div>

          {loginError && (
            <div className="p-3 mb-5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs font-semibold text-rose-400 text-center animate-fadeIn">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4 text-left">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Mail className="h-3 w-3 text-brand-400" /> อีเมลผู้ใช้
              </label>
              <input
                type="email"
                required
                placeholder="email@syncdraft.com"
                className="glass-input w-full px-4 py-2.5 rounded-lg text-sm text-slate-200"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Lock className="h-3 w-3 text-brand-400" /> รหัสผ่าน
              </label>
              <input
                type="password"
                required
                placeholder="••••••"
                className="glass-input w-full px-4 py-2.5 rounded-lg text-sm text-slate-200 animate-fadeIn"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-3 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white font-bold rounded-lg transition-all shadow-lg shadow-brand-500/20 text-sm mt-6 flex items-center justify-center gap-2"
            >
              {isLoggingIn ? (
                <span>กำลังเข้าระบบ...</span>
              ) : (
                <>
                  <span>เข้าสู่ระบบ</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-8 border-t border-slate-900 pt-4 text-center">
            <span className="text-[10px] text-slate-500 leading-relaxed block">
              💡 เข้าระบบครั้งแรกด้วยบัญชีผู้ใช้เริ่มต้น เช่น:
            </span>
            <span className="text-[10px] text-brand-400 mt-1 block font-semibold">
              Admin: admin@syncdraft.com (รหัสผ่าน: admin123)
            </span>
            <span className="text-[10px] text-slate-400 mt-0.5 block font-semibold">
              Engineer: supharoek@syncdraft.com (รหัสผ่าน: 123456)
            </span>
          </div>

        </div>
      </div>
    );
  }

  // IF AUTHENTICATED BUT LOADING: Show loading screen (handles Render cold start)
  if (token && isLoading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#0b0f19] gap-6 font-sans">
        <div className="h-16 w-16 rounded-2xl bg-gradient-to-tr from-brand-600 to-cyan-400 flex items-center justify-center font-bold text-3xl text-white shadow-lg shadow-brand-500/30 animate-pulse">
          ⚡
        </div>
        <div className="text-center">
          <p className="text-slate-200 font-bold text-base">กำลังเชื่อมต่อระบบ...</p>
          <p className="text-slate-500 text-xs mt-2">กรุณารอสักครู่ ระบบ Backend กำลังเริ่มทำงาน</p>
          <p className="text-slate-600 text-[10px] mt-1">(Render free tier ใช้เวลาประมาณ 30-60 วินาที)</p>
        </div>
        <div className="flex gap-1.5 mt-2">
          <span className="w-2 h-2 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
          <span className="w-2 h-2 bg-brand-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
          <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
        </div>
      </div>
    );
  }

  // IF ERROR (backend unreachable): Show retry screen
  if (token && error) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#0b0f19] gap-6 font-sans px-4">
        <div className="h-16 w-16 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-3xl">
          ⚠️
        </div>
        <div className="text-center max-w-sm">
          <p className="text-slate-200 font-bold text-base">ไม่สามารถเชื่อมต่อ Backend ได้</p>
          <p className="text-slate-500 text-xs mt-2 leading-relaxed">
            Render อาจยังไม่ตื่น (cold start) หรือ network มีปัญหา<br />
            กรุณากด Retry อีกครั้ง
          </p>
          <p className="text-rose-400/70 text-[10px] mt-2 font-mono">{error}</p>
        </div>
        <div className="flex gap-3 mt-2">
          <button
            onClick={() => { setError(null); setIsLoading(true); fetchData(); }}
            className="px-6 py-2.5 bg-brand-600 hover:bg-brand-500 text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-brand-500/20 flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" /> Retry เชื่อมต่อใหม่
          </button>
          <button
            onClick={handleLogout}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-sm transition-all"
          >
            ออกจากระบบ
          </button>
        </div>
      </div>
    );
  }

  // IF AUTHENTICATED: Render main app workspace

  return (
    <div className="font-sans min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col selection:bg-brand-500 selection:text-white pb-20">

      {/* Dynamic styles injected for floor cards */}
      <style dangerouslySetInnerHTML={{
        __html: `
        .s-waiting { border-color: rgba(100,116,139,0.3) !important; background: rgba(30,41,59,0.2) !important; }
        .s-revise { border-color: rgba(244,63,94,0.3) !important; background: rgba(244,63,94,0.06) !important; }
        .s-ready { border-color: rgba(34,211,238,0.3) !important; background: rgba(34,211,238,0.06) !important; }
        .s-working { border-color: rgba(251,191,36,0.3) !important; background: rgba(251,191,36,0.06) !important; }
        .s-done { border-color: rgba(16,185,129,0.3) !important; background: rgba(16,185,129,0.06) !important; }
        .s-released { border-color: rgba(167,139,250,0.3) !important; background: rgba(167,139,250,0.06) !important; }
      `}} />

      {/* HEADER CONTROL BAR */}
      <header className="sticky top-0 z-40 bg-[#0b0f19]/85 backdrop-blur-xl border-b border-slate-900 py-3 px-6 flex flex-wrap items-center justify-between gap-4">

        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-brand-600 to-cyan-400 flex items-center justify-center font-bold text-xl text-white shadow-md shadow-brand-500/20">
            ⚡
          </div>
          <div className="text-left">
            <h1 className="text-base font-extrabold tracking-wide leading-none text-slate-200">Cpost Hard</h1>
            <span className="text-[10px] font-bold text-brand-400 mt-1 block">ENGINEER & DRAFT BOARD</span>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Currently logged-in profile bar */}
          <div className="flex items-center gap-3 bg-slate-900/60 border border-slate-800/80 px-4 py-1.5 rounded-xl">
            <div className="text-right">
              <span className="text-xs font-bold text-slate-200 block">{currentUser.name}</span>
              <span className="text-[9px] font-bold text-brand-400 uppercase tracking-widest block">{currentUser.role}</span>
            </div>
            <button
              onClick={handleLogout}
              className="p-1 text-slate-400 hover:text-rose-400 rounded-lg transition-all"
              title="ออกจากระบบ"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* BODY CONTENT CONTAINER */}
      <div className="max-w-[1320px] w-full mx-auto px-6 mt-8 flex-grow">

        {/* NAV TABS SELECTOR */}
        <div className="flex justify-between items-center border-b border-slate-900 mb-8 overflow-x-auto">
          <div className="flex gap-8">
            <button onClick={() => setActiveTab('workspace')} className={`pb-4 text-xs font-bold flex gap-1.5 border-b-2 ${activeTab === 'workspace' ? 'border-brand-500 text-brand-400' : 'border-transparent text-slate-400'}`}><Layers className="h-4 w-4" /> Workspace</button>
            <button onClick={() => setActiveTab('calendar')} className={`pb-4 text-xs font-bold flex gap-1.5 border-b-2 ${activeTab === 'calendar' ? 'border-brand-500 text-brand-400' : 'border-transparent text-slate-400'}`}><Calendar className="h-4 w-4" /> Calendar</button>
            <button onClick={() => setActiveTab('dashboard')} className={`pb-4 text-xs font-bold flex gap-1.5 border-b-2 ${activeTab === 'dashboard' ? 'border-brand-500 text-brand-400' : 'border-transparent text-slate-400'}`}><LayoutDashboard className="h-4 w-4" /> Dashboard</button>
            <button onClick={() => setActiveTab('recovery')} className={`pb-4 text-xs font-bold flex gap-1.5 border-b-2 ${activeTab === 'recovery' ? 'border-brand-500 text-brand-400' : 'border-transparent text-slate-400'}`}><RefreshCw className="h-4 w-4" /> Recovery</button>
            {currentUser?.role === 'admin' && <button onClick={() => setActiveTab('admin')} className={`pb-4 text-xs font-bold flex gap-1.5 border-b-2 ${activeTab === 'admin' ? 'border-brand-500 text-brand-400' : 'border-transparent text-slate-400'}`}><SettingsIcon className="h-4 w-4" /> Admin</button>}
          </div>

          {/* Quick toggle filter by roles */}
          {activeTab === 'workspace' && currentUser && currentUser.role !== 'admin' && (
            <div className="flex items-center gap-2 mb-3 bg-slate-900/60 p-1.5 rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-500 font-semibold px-2">กรองงาน:</span>
              <button
                onClick={() => setFilterOnlyMyWork(true)}
                className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${filterOnlyMyWork ? 'bg-brand-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
                  }`}
              >
                งานของฉัน
              </button>
              <button
                onClick={() => setFilterOnlyMyWork(false)}
                className={`px-3 py-1 text-[10px] font-bold rounded-lg transition-all ${!filterOnlyMyWork ? 'bg-brand-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
                  }`}
              >
                งานทั้งหมด
              </button>
            </div>
          )}
        </div>

        {/* TAB 1: WORKSPACE */}
        {activeTab === 'workspace' && (
          <div className="space-y-6 animate-fadeIn">

            {/* 🌟 รวบแถบเครื่องมือทั้งหมดให้อยู่ในกล่องเดียว ชั้นเดียว เรียงสวยงาม */}
            <div className="glass-panel p-4 rounded-2xl border border-slate-800 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-slate-900/60">

              {/* กลุ่มฝั่งซ้าย: ค้นหา & ตัวกรอง */}
              <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto flex-1">
                <div className="min-w-[220px] relative flex-1 lg:flex-none">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input type="text" placeholder="ค้นหาเลขที่, ชื่อโครงการ..."
                    className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-lg pl-9 pr-4 py-2 text-sm focus:border-brand-500 outline-none transition-colors"
                    value={wsSearch} onChange={(e) => setWsSearch(e.target.value)} />
                </div>
                <select className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm" value={wsFilterEng} onChange={(e) => setWsFilterEng(e.target.value)}>
                  <option value="ALL">👨‍🔧 วิศวกรทั้งหมด</option>
                  {users.filter(u => u.role === 'engineer' || u.role === 'admin').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <select className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm" value={wsFilterDraft} onChange={(e) => setWsFilterDraft(e.target.value)}>
                  <option value="ALL">📐 ดร๊าฟทั้งหมด</option>
                  {users.filter(u => u.role === 'draft').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <select className="bg-slate-800 border border-slate-700 text-slate-200 rounded-lg px-3 py-2 text-sm" value={wsFilterStatus} onChange={(e) => setWsFilterStatus(e.target.value)}>
                  <option value="ALL">📌 ทุกสถานะ</option>
                  {STATUS_FLOW.map(st => <option key={st} value={st}>{st}</option>)}
                </select>
              </div>

              {/* กลุ่มฝั่งขวา: ปุ่มเครื่องมือ และสร้างโครงการ */}
              <div className="flex items-center gap-2 w-full lg:w-auto justify-end border-t lg:border-t-0 border-slate-800 pt-3 lg:pt-0">
                <button onClick={() => toggleAllAccordions(true)} className="px-3 py-2 bg-slate-900 border border-slate-700 text-xs font-bold rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-all">ขยายทั้งหมด</button>
                <button onClick={() => toggleAllAccordions(false)} className="px-3 py-2 bg-slate-900 border border-slate-700 text-xs font-bold rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-all">ย่อทั้งหมด</button>
                {currentUser?.role === 'engineer' && (
                  <button onClick={() => { setIsCreateProjectOpen(true); setNewEngineerId(currentUser.id.toString()); }} className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white font-bold rounded-lg text-sm flex items-center gap-1.5 shadow-lg shadow-brand-500/20 transition-all ml-1">
                    <Plus className="h-4 w-4" /> สร้างโครงการ
                  </button>
                )}
              </div>
            </div>

            {/* Warning Message */}
            {myStressWarningMessage && (
              <div className="p-4 bg-rose-950/20 border border-rose-500/30 rounded-2xl flex items-start gap-3 animate-fadeIn text-left">
                <AlertTriangle className="h-5 w-5 text-rose-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-rose-300 font-semibold leading-relaxed">
                  {myStressWarningMessage}
                </p>
              </div>
            )}

            {/* Checklist guide desk (เรียงลำดับคิวงานเดดไลน์ด่วนที่สุด) */}
            {currentUser && currentUser.role === 'draft' && draftChecklistData.length > 0 && (
              <div className="glass-panel p-5 rounded-2xl border border-brand-500/25 bg-brand-500/5 text-left">
                <h3 className="text-sm font-extrabold text-brand-300 flex items-center gap-2 mb-3">
                  <ListTodo className="h-4 w-4" />
                  แผงจัดลำดับคิวงานร่างแบบ (Draftsperson Task Priority Guide)
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {draftChecklistData.map(item => (
                    <div key={item.id} className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 flex justify-between items-center gap-3">
                      <div className="text-left truncate">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-900 border border-slate-800 text-brand-300 font-mono">
                            #{item.projectNumber}
                          </span>
                          <span className="text-xs font-bold text-slate-200 truncate">{item.name}</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5 truncate">โครงการ: {item.projectName}</p>
                        <p className="text-[10px] text-slate-400 mt-1">เดดไลน์: {item.deadline}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-[8.5px] px-1.5 py-0.5 rounded font-extrabold ${item.delayRisk === 'OVERDUE' ? 'bg-rose-500/20 text-rose-400 animate-pulse' : 'bg-amber-500/20 text-amber-400'
                          }`}>
                          {item.delayRisk}
                        </span>
                        <button
                          onClick={(e) => handleDraftComplete(item.id, e)}
                          className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-bold flex items-center gap-1 shadow-md"
                        >
                          <Check className="h-3 w-3" /> เสร็จ
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* List of Active projects */}
            <div className="space-y-4">
              {activeProjectsFiltered.length === 0 ? (
                <div className="glass-panel p-12 text-center text-slate-400 font-medium rounded-2xl">
                  ไม่มีโครงการใช้งานที่ตรงตามฟิลเตอร์ของคุณ
                </div>
              ) : (
                activeProjectsFiltered.map(proj => {
                  const isExpanded = openProjectAccordions[proj.id];
                  const filteredFloors = proj.floorZones ? proj.floorZones.filter(fz => {
                    // กรองตามผู้รับผิดชอบหลัก/ย่อย (เมื่อเลือกแสดงเฉพาะงานของฉัน)
                    if (filterOnlyMyWork && currentUser && currentUser.role === 'draft') {
                      return (fz.assignedDraftId || proj.draftId) === currentUser.id;
                    }
                    // กรองดร๊าฟรายบุคคลจาก Workspace filter
                    if (wsFilterDraft !== 'ALL' && (fz.assignedDraftId || proj.draftId) !== parseInt(wsFilterDraft)) {
                      return false;
                    }
                    // กรองสถานะชั้นงานจาก Workspace filter
                    if (wsFilterStatus !== 'ALL' && fz.status !== wsFilterStatus) {
                      return false;
                    }
                    return true;
                  }) : [];

                  if (filteredFloors.length === 0 && (wsFilterStatus !== 'ALL' || wsFilterDraft !== 'ALL' || (filterOnlyMyWork && currentUser?.role === 'draft'))) return null;

                  return (
                    <div key={proj.id} className="glass-panel rounded-xl border border-slate-800/80 overflow-hidden">

                      {/* Project Header Info */}
                      <div
                        onClick={() => toggleAccordion(proj.id)}
                        className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 bg-slate-900/40 hover:bg-slate-900/60 transition-all cursor-pointer select-none text-left"
                      >
                        <div className="flex items-center gap-3">
                          {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-brand-500/15 text-brand-300 border border-brand-500/25">
                              #{proj.projectNumber}
                            </span>
                            <h2 className="text-sm font-bold text-slate-200">{proj.projectName}</h2>
                            <span className="text-[10px] text-slate-500">({filteredFloors.length} ชั้นย่อย)</span>
                          </div>
                        </div>

                        {/* Project Actions */}
                        <div className="flex items-center gap-3 flex-wrap" onClick={e => e.stopPropagation()}>
                          <div className="flex gap-3 text-[10px] text-slate-400">
                            <span><strong className="text-slate-500">วิศวกร:</strong> {proj.engineer?.name}</span>
                            <span><strong className="text-slate-500">ดร๊าฟ:</strong> {proj.draft?.name}</span>
                          </div>

                          {proj.floorZones && proj.floorZones.some(fz => fz.status === 'มีแบบ Shop แล้ว') && (
                            <button
                              onClick={(e) => handleBatchRelease(proj.id, e)}
                              className="px-2.5 py-1 bg-purple-600/10 border border-purple-500/25 hover:bg-purple-600/25 text-purple-300 text-[10px] font-bold rounded-md flex items-center gap-1 transition-all"
                              title="ส่งออกของแบบกลุ่ม"
                            >
                              <Spline className="h-3 w-3" /> ออกของกลุ่ม
                            </button>
                          )}

                          {currentUser && currentUser.role === 'engineer' && proj.engineerId === currentUser.id && (
                            <button
                              onClick={(e) => handleArchiveProject(proj.id, e)}
                              className="px-2.5 py-1 bg-slate-950 border border-slate-800 hover:border-brand-500 hover:text-brand-300 text-[10px] font-bold rounded-md flex items-center gap-1 transition-all text-slate-400"
                              title="จบโครงการ"
                            >
                              <Archive className="h-3 w-3" /> จบโครงการ
                            </button>
                          )}

                          {/* Delete project button */}
                          {(currentUser.role === 'admin' || (currentUser.role === 'engineer' && proj.engineerId === currentUser.id)) && (
                            <button
                              onClick={(e) => handleDeleteProject(proj.id, e)}
                              className="px-2.5 py-1 bg-slate-950 border border-slate-800 hover:border-rose-500 hover:text-rose-400 text-[10px] font-bold rounded-md flex items-center gap-1 transition-all text-slate-400"
                              title="ลบโครงการอย่างถาวร"
                            >
                              <Trash2 className="h-3 w-3 text-rose-500" /> ลบโครงการ
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Accordion Content */}
                      {isExpanded && (
                        <div className="p-4 space-y-4 border-t border-slate-800/40 text-left">

                          {/* Micro condensed floor pills grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                            {filteredFloors.map(fz => {
                              const delayRisk = fz.delayRisk;
                              const isOverdue = delayRisk === 'OVERDUE';
                              const assignedOwnerDraftId = fz.assignedDraftId || proj.draftId;
                              const isDraft = currentUser && currentUser.role === 'draft' && assignedOwnerDraftId === currentUser.id;
                              const canEdit = currentUser?.role === 'admin' ||
                                (currentUser?.role === 'engineer' && proj.engineerId === currentUser.id) ||
                                (currentUser?.role === 'draft' && (fz.assignedDraftId || proj.draftId) === currentUser.id);

                              return (
                                <div
                                  key={fz.id}
                                  onClick={() => {
                                    if (canEdit) openFloorEditor(fz, proj);
                                  }}
                                  className={`p-2 rounded-lg border h-20 flex flex-col justify-between relative transition-all duration-150 ${getStatusStyle(fz.status)} ${canEdit ? 'cursor-pointer hover:-translate-y-0.5' : 'cursor-default opacity-60 grayscale-[30%]'}`}
                                >
                                  <div>
                                    <div className="flex justify-between items-start">
                                      <h3 className="font-bold text-[11px] truncate text-slate-200">{fz.name}</h3>
                                      {fz.notes && <FileText className="h-3 w-3 text-amber-400 flex-shrink-0" />}
                                    </div>
                                    <div className="flex gap-1.5 text-[8.5px] text-slate-400 font-mono mt-0.5">
                                      <span>{workloadConfig.hoursPerSheet}h</span><span>|</span><span>{fz.deadline ? fz.deadline.slice(5) : 'No DL'}</span>
                                    </div>
                                    <div className="text-[8px] text-slate-500 mt-1 truncate">
                                      Assign: {fz.assignedDraft?.name || proj.draft?.name}
                                    </div>
                                  </div>

                                  {getDelayRisk(fz) === 'OVERDUE' && <div className="absolute top-1 right-1 h-2 w-2 bg-rose-500 rounded-full animate-ping"></div>}

                                  <div className="mt-auto flex justify-between items-center pt-1 border-t border-slate-850/60">
                                    <span className="text-[8.5px] font-extrabold truncate w-14">{fz.status}</span>
                                    {currentUser?.role === 'draft' && (fz.assignedDraftId || proj.draftId) === currentUser.id && fz.status !== 'มีแบบ Shop แล้ว' && fz.status !== 'ออกของแล้ว' && (
                                      <button onClick={(e) => handleDraftComplete(fz.id, e)} className="bg-emerald-600 hover:bg-emerald-500 text-white rounded p-1 shadow-md transition-all">
                                        <Check className="h-2.5 w-2.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>

                          {/* Quick Add Floor */}
                          {currentUser && currentUser.role === 'engineer' && proj.engineerId === currentUser.id && (
                            <div className="pt-3 border-t border-slate-800/40 flex flex-wrap items-center gap-3 bg-slate-900/10 p-2.5 rounded-lg border border-slate-800/40">
                              <span className="text-xs font-semibold text-slate-400">เพิ่มชั้นงานย่อย (Quick Add):</span>
                              <input
                                type="text"
                                placeholder="ชื่อชั้น/โซน"
                                className="glass-input px-2 py-1 text-xs rounded border w-28 text-slate-200"
                                value={quickFloorName[proj.id] || ''}
                                onChange={(e) => setQuickFloorName({ ...quickFloorName, [proj.id]: e.target.value })}
                              />
                              <input
                                type="date"
                                className="glass-input px-2 py-1 text-xs rounded border text-slate-200"
                                value={quickFloorDeadline[proj.id] || defaultDeadline}
                                onChange={(e) => setQuickFloorDeadline({ ...quickFloorDeadline, [proj.id]: e.target.value })}
                              />
                              <button
                                onClick={() => handleQuickAddFloor(proj.id)}
                                className="px-3 py-1 bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold rounded flex items-center gap-1 transition-all"
                              >
                                <Plus className="h-3 w-3" /> เพิ่มชั้นงาน
                              </button>
                            </div>
                          )}

                        </div>
                      )}

                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}



        {/* TAB 2: ANALYTICAL DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-fadeIn text-left">
            {/* Overview cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="glass-card p-6 rounded-2xl">
                <span className="text-sm font-semibold text-slate-400 block">Total Active Floor/Zones</span>
                <span className="text-3xl font-extrabold mt-1 text-white block">{dashboardData.stats.totalFloors || 0}</span>
              </div>
              <div className="glass-card p-6 rounded-2xl">
                <span className="text-sm font-semibold text-slate-400 block">Active Layouts (Floors)</span>
                <span className="text-3xl font-extrabold mt-1 text-white block">{dashboardData.stats.activeFloors || 0}</span>
              </div>
              <div className="glass-card p-6 rounded-2xl border-rose-500/30">
                <span className="text-sm font-semibold text-slate-400 block">Overdue Deadlines</span>
                <span className={`text-3xl font-extrabold mt-1 block ${dashboardData.stats.overdueFloors > 0 ? 'text-rose-400 font-extrabold' : 'text-slate-200'}`}>{dashboardData.stats.overdueFloors || 0}</span>
              </div>
              <div className="glass-card p-6 rounded-2xl">
                <span className="text-sm font-semibold text-slate-400 block">Completed Shop Drawings</span>
                <span className="text-3xl font-extrabold mt-1 text-white block">{dashboardData.stats.completedFloors || 0}</span>
              </div>
            </div>

            {/* Load balanced suggestions */}
            {currentUser && currentUser.role === 'engineer' && recommendedDraft && (
              <div className="p-4 bg-emerald-950/20 border border-emerald-500/30 rounded-xl flex items-center justify-between gap-4 animate-fadeIn">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-6 w-6 text-emerald-400" />
                  <div>
                    <span className="text-xs font-bold text-slate-200 block">คำแนะนำในการเฉลี่ยโหลดงาน (Load Balancing Recommendation):</span>
                    <p className="text-xs text-slate-400 mt-0.5">
                      คุณ **{recommendedDraft.name}** มีความเครียดของคิวงานค้างน้อยที่สุดในระบบ (**{recommendedDraft.estimatedHours} ชั่วโมง**) แนะนำให้จ่ายคิวโครงการถัดไปให้ดร๊าฟท่านนี้เพื่อความคล่องตัวในการทำงาน
                    </p>
                  </div>
                </div>
                <div className="text-right whitespace-nowrap">
                  <span className="text-[10px] text-slate-500 uppercase block">Queue stress</span>
                  <span className="text-sm font-bold text-emerald-400 font-mono">{recommendedDraft.activeFloors} งานค้าง</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

              {/* DRAFTSPERSON STRESS VIEW */}
              <div className="glass-panel p-6 rounded-2xl text-left">
                <h3 className="text-base font-bold text-slate-200 flex items-center gap-2 mb-4 border-b border-slate-800 pb-3">
                  <Users className="h-5 w-5 text-brand-400" />
                  ตาราง Workload & Delay Tracker ของดร๊าฟทุกคน
                </h3>
                <div className="space-y-4">
                  {dashboardData.draftWorkloads.map(draft => {
                    const isHigh = draft.activeFloors > workloadConfig.maxSheetsThreshold;
                    return (
                      <div key={draft.id} className="p-4 bg-slate-900/40 rounded-xl border border-slate-800 space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-200 flex items-center gap-2">
                            {draft.name}
                            {isHigh && (
                              <span className="text-[9px] px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 font-extrabold border border-rose-500/20 animate-pulse">
                                OVERLOAD
                              </span>
                            )}
                          </span>
                          {draft.overdueFloors > 0 && <span className="text-rose-400 text-xs font-bold">{draft.overdueFloors} Overdue</span>}
                        </div>
                        <div>
                          <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.round(Math.min(100, (draft.estimatedHours / 40) * 100))}%` }}></div>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-center text-xs bg-slate-950 p-2 rounded">
                          <div><span className="text-[10px] text-slate-500">โครงการดูแล</span><span className="block font-bold text-slate-300">{calculateDraftProjectsCount(draft.id)}</span></div>
                          <div><span className="text-[10px] text-slate-500">จำนวนชั้น (แผ่น)</span><span className="block font-bold text-brand-300">{draft.activeFloors}</span></div>
                          <div><span className="text-[10px] text-slate-500">ภาระงานสะสม</span><span className="block font-bold text-cyan-300">{draft.estimatedHours} ชม.</span></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ENGINEER PLANNER VIEW */}
              <div className="glass-panel p-6 rounded-2xl text-left">
                <h3 className="text-base font-bold text-slate-200 flex items-center gap-2 mb-4 border-b border-slate-800 pb-3">
                  <UserCheck className="h-5 w-5 text-brand-400" />
                  ฝ่ายประสานวิศวกรผู้ดูแลโครงการ (Engineer Planner Desk)
                </h3>
                <div className="space-y-4">
                  {dashboardData.engineerWorkloads.map(eng => (
                    <div key={eng.id} className="p-4 bg-slate-900/40 rounded-xl border border-slate-800 space-y-3">
                      <span className="font-bold text-slate-200 block">{eng.name}</span>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs bg-slate-950 p-2 rounded">
                        <div>
                          <span className="text-[10px] text-slate-500">โครงการที่ดูแล</span>
                          <span className="block font-bold text-slate-300">{eng.projectsCount} โครงการ</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500">จำนวนชั้นสะสม (แผ่น)</span>
                          <span className="block font-bold text-brand-300">{eng.activeFloors} ชั้น</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500">เสร็จสิ้นแล้ว</span>
                          <span className="block font-bold text-emerald-400">{eng.completedFloors} ชั้น</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* TAB 3: RESTORATION */}
        {activeTab === 'recovery' && (
          <div className="space-y-8 animate-fadeIn max-w-4xl text-left">
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-6">
              <div>
                <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2 mb-2">
                  <RefreshCw className="h-5 w-5 text-brand-400" />
                  ตู้กู้คืนข้อมูล (Restoration Accident Recovery Desk)
                </h2>
                <p className="text-xs text-slate-400 border-b border-slate-800 pb-4">
                  กู้คืนข้อมูลชั้นงานย่อยที่เผลอกดลบผิด หรือโครงการที่ปิดเป้าหมายสำเร็จไปแล้วให้ดึงกลับมาเป็นปกติ
                </p>
              </div>

              {/* Archived projects */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wide">โครงการที่ปิดไปแล้ว (Archived Projects)</h3>
                {archivedData.archivedProjects?.length === 0 ? (
                  <p className="text-xs text-slate-500 italic p-4 bg-slate-900/20 rounded border border-slate-900">ไม่มีประวัติโครงการที่ปิดไป</p>
                ) : (
                  archivedData.archivedProjects?.map(proj => (
                    <div key={proj.id} className="p-4 bg-slate-900/40 rounded-xl border border-slate-800 flex justify-between items-center">
                      <div>
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-brand-500/10 text-brand-300">#{proj.projectNumber}</span>
                        <span className="font-semibold text-slate-200 ml-2">{proj.projectName}</span>
                      </div>
                      <button onClick={() => handleRestoreProject(proj.id)} className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 rounded text-xs font-bold flex items-center gap-1">
                        <RefreshCw className="h-3 w-3" /> ดึงกลับโครงการ
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Soft Deleted floor zones */}
              <div className="space-y-4 pt-4">
                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wide">ชั้นงานย่อยที่ถูกลบ (Soft Deleted Floor/Zones)</h3>
                {archivedData.softDeletedFloors?.length === 0 ? (
                  <p className="text-xs text-slate-500 italic p-4 bg-slate-900/20 rounded border border-slate-900">ไม่มีประวัติชั้นงานย่อยที่ถูกลบ</p>
                ) : (
                  archivedData.softDeletedFloors?.map(fz => (
                    <div key={fz.id} className="p-4 bg-slate-900/40 rounded-xl border border-slate-800 flex justify-between items-center">
                      <div>
                        <span className="font-semibold text-slate-200 block">{fz.name}</span>
                        <p className="text-[10px] text-slate-500 mt-1">โครงการ: {fz.project?.projectName}</p>
                      </div>
                      <button onClick={() => handleRestoreFloor(fz.id)} className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 rounded text-xs font-bold flex items-center gap-1">
                        <RefreshCw className="h-3 w-3" /> กู้คืนชั้นงาน
                      </button>
                    </div>
                  ))
                )}
              </div>

            </div>
          </div>
        )}
        {/* TAB 4: CALENDAR */}
        {activeTab === 'calendar' && (
          <div className="space-y-6">
            <div className="glass-panel p-6 rounded-2xl border border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4 text-left">
              <div>
                <h2 className="text-lg font-bold text-slate-200"><Calendar className="h-5 w-5 text-brand-400 inline mr-2" /> ปฏิทินกำหนดส่งงาน (Timeline Board)</h2>
                <p className="text-xs text-slate-400">สลับโหมด เดือน/สัปดาห์/วัน ได้อิสระ (ลากการ์ดเพื่อเปลี่ยนวันเดดไลน์ หรือเปลี่ยนดร๊าฟ)</p>
              </div>
              <div className="flex gap-3 text-sm">
                <select className="bg-slate-800 text-slate-200 rounded-lg px-3 py-1.5 border border-slate-700" value={calendarFilterEng} onChange={(e) => setCalendarFilterEng(e.target.value)}><option value="ALL">👨‍🔧 วิศวกรทุกคน</option>{users.filter(u => u.role === 'engineer' || u.role === 'admin').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
                <select className="bg-slate-800 text-slate-200 rounded-lg px-3 py-1.5 border border-slate-700" value={calendarFilterDraft} onChange={(e) => setCalendarFilterDraft(e.target.value)}><option value="ALL">📐 ดร๊าฟทุกคน</option>{users.filter(u => u.role === 'draft').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
              </div>
            </div>

            {/* 🌟 ปรับ Layout เป็น 2 คอลัมน์: แถบสี (ซ้าย) และ ปฏิทิน (ขวา) */}
            <div className="flex flex-col xl:flex-row gap-6 items-start">

              {/* แถบ Sidebar แสดงสัญลักษณ์สี และ จำนวนงานของดร๊าฟ */}
              <div className="w-full xl:w-64 flex flex-col gap-4 flex-shrink-0">
                <div className="glass-panel p-4 rounded-2xl border border-slate-800 bg-slate-900/60 sticky top-24">
                  <h3 className="text-sm font-bold text-slate-200 mb-3 border-b border-slate-800 pb-2 flex items-center gap-2">
                    🎨 สัญลักษณ์สี (Drafts)
                  </h3>
                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                    {users.filter(u => u.role === 'draft').map(u => {
                      // ดึงค่าสีให้ตรงกับในปฏิทินเป๊ะๆ
                      const colors = ['#f43f5e', '#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#3b82f6'];
                      const dotColor = colors[u.id % colors.length];

                      // คำนวณหาว่ามีกี่ "ชั้น/โซน" (งาน) ที่ยังทำไม่เสร็จและลงปฏิทินไว้
                      let activeTasks = 0;
                      projects.filter(p => !p.isArchived).forEach(p => {
                        p.floorZones?.forEach(fz => {
                          if (fz.deadline && !COMPLETED_STATUSES.has(fz.status)) {
                            const ownerDraftId = fz.assignedDraftId || p.draftId;
                            if (ownerDraftId === u.id) activeTasks++;
                          }
                        });
                      });

                      return (
                        <div key={u.id} className="flex justify-between items-center bg-slate-800/50 p-2.5 rounded-xl border border-slate-700/50 hover:bg-slate-800 transition-colors">
                          <div className="flex items-center gap-2.5 truncate">
                            <span className="w-3.5 h-3.5 rounded-full flex-shrink-0 shadow-sm border border-slate-800/50" style={{ backgroundColor: dotColor }}></span>
                            <span className="text-xs text-slate-200 truncate font-semibold">{u.name}</span>
                          </div>
                          <span className="text-[10px] font-extrabold bg-slate-950 px-2 py-1 rounded text-brand-400 flex-shrink-0 shadow-inner">
                            {activeTasks} งาน
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 text-[9px] text-slate-500 bg-slate-950/50 p-2 rounded-lg border border-slate-800/50">
                    💡 ตัวเลขคือจำนวนชั้น/โซนที่มีเดดไลน์และยังทำไม่เสร็จ
                  </div>
                </div>
              </div>

              {/* กระดานปฏิทิน (Main Board) */}
              <div className="glass-panel p-5 rounded-2xl border border-slate-800 bg-slate-50 h-[850px] flex-1 min-w-0 w-full">
                <style dangerouslySetInnerHTML={{
                  __html: `
                  .rbc-calendar { font-family: 'Sarabun', sans-serif; background: transparent; border-radius: 12px; } 
                  .rbc-header { padding: 12px 0; font-weight: 800; color: #475569; border-bottom: 2px solid #e2e8f0; font-size: 13px; }
                  .rbc-month-view { border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: white; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
                  .rbc-date-cell { padding: 4px 8px; font-weight: 700; color: #64748b; font-size: 12px; }
                  
                  /* การ์ดปฏิทิน Hover ธรรมดา ไม่ขยายตารางแล้ว */
                  .rbc-event { padding: 0 !important; margin: 1px 0 !important; border-radius: 0 !important; background: transparent !important; }
                  .rbc-event:hover { z-index: 10; background: transparent !important; }
                  .rbc-time-view .rbc-time-content { display: none !important; } 
                  .rbc-time-view .rbc-allday-cell { min-height: 650px; max-height: none !important; overflow-y: auto; background: white; border-radius: 12px;}
                  .rbc-time-view .rbc-time-header { flex: 1 1 0% !important; border-bottom: none !important; }
                  .rbc-time-gutter { display: none !important; } 
                  .rbc-time-header-content { border-left: none !important; }
                  .rbc-time-view { border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
                  .rbc-show-more { background-color: #f8fafc; color: #3b82f6 !important; font-size: 11px; font-weight: 800; padding: 4px 8px; border-radius: 6px; text-align: center; margin: 2px 4px; border: 1px solid #e2e8f0; }
                  .rbc-show-more:hover { background-color: #eff6ff; color: #1d4ed8 !important; }
                ` }} />
                <DnDCalendar
                  localizer={localizer}
                  culture="th"
                  onEventDrop={handleEventDrop}
                  views={[Views.MONTH, Views.WEEK, Views.DAY]}
                  defaultView={Views.MONTH}
                  popup={true}
                  messages={{
                    showMore: (total) => `+ ดูเพิ่ม ${total} งาน`,
                    today: 'วันนี้', previous: '< ก่อนหน้า', next: 'ถัดไป >',
                    month: 'เดือน', week: 'สัปดาห์', day: 'วัน', noEventsInRange: 'ไม่มีคิวงาน'
                  }}
                  events={(() => {
                    const evts = [];
                    projects.filter(p => !p.isArchived).forEach(proj => {
                      if (calendarFilterEng !== 'ALL' && proj.engineerId !== parseInt(calendarFilterEng)) return;

                      proj.floorZones?.forEach(fz => {
                        if (fz.deadline && !COMPLETED_STATUSES.has(fz.status)) {
                          const ownerDraftId = fz.assignedDraftId || proj.draftId;
                          if (calendarFilterDraft !== 'ALL' && ownerDraftId !== parseInt(calendarFilterDraft)) return;
                          if (currentUser?.role === 'draft' && ownerDraftId !== currentUser.id) return;

                          const targetDate = new Date(fz.deadline);
                          targetDate.setHours(0, 0, 0, 0);

                          evts.push({
                            id: fz.id, projectId: proj.id, zoneId: fz.id,
                            projectNumber: proj.projectNumber,
                            projectName: proj.projectName || 'ไม่ระบุชื่อ',
                            zoneName: fz.name,
                            engName: users.find(u => u.id === proj.engineerId)?.name || 'N/A',
                            draftName: users.find(u => u.id === ownerDraftId)?.name || 'ไม่ระบุดร๊าฟ',
                            draftId: ownerDraftId,
                            status: fz.status, isOverdue: getDelayRisk(fz) === 'OVERDUE',
                            start: targetDate, end: targetDate,
                            allDay: true,
                            resourceId: ownerDraftId
                          });
                        }
                      });
                    });
                    return evts;
                  })()}
                  step={60}
                  eventPropGetter={(event) => {
                    // เอาสีพื้นหลังและกรอบออกทั้งหมด ให้การ์ดโปร่งใส (มินิมอล)
                    return {
                      style: {
                        backgroundColor: 'transparent',
                        border: 'none',
                        boxShadow: 'none',
                        padding: '0'
                      }
                    };
                  }}
                  components={{
                    event: ({ event }) => {
                      const colors = ['#f43f5e', '#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#3b82f6'];
                      const dotColor = event.draftId ? colors[event.draftId % colors.length] : '#94a3b8';
                      return (
                        <div
                          className="w-full flex items-center justify-center gap-1.5 py-0.5 cursor-pointer hover:scale-125 transition-transform"
                          // เพิ่ม Tooltip ให้ชี้แล้วเห็นชื่อคนทำและชื่อโปรเจกต์ชัดๆ ทันที
                          title={`โครงการ: [${event.projectNumber}] ${event.projectName}\nดร๊าฟ: ${event.draftName}\nสถานะ: ${event.status}`}
                        >
                          {/* 🌟 โชว์จุดสีดร๊าฟเสมอ (จะได้รู้ว่างานใคร) */}
                          <span className="w-3.5 h-3.5 rounded-full shadow-sm border border-slate-400/50 flex-shrink-0" style={{ backgroundColor: dotColor }}></span>

                          {/* 🌟 ถ้าเลยกำหนด ค่อยโชว์ไซเรนข้างๆ จุดสี */}
                          {event.isOverdue && (
                            <span className="text-red-600 animate-pulse text-[12px] leading-none">🚨</span>
                          )}
                        </div>
                      )
                    }
                  }}
                />
              </div>
            </div>
            {/* ======================================================== */}
            {/* 🌟 Gantt Chart 14 วัน สำหรับดร๊าฟ */}
            {/* ======================================================== */}
            {/* ======================================================== */}
            {/* 🌟 Gantt Chart 14 วัน สำหรับดร๊าฟ */}
            {/* ======================================================== */}
            <div className="glass-panel p-6 rounded-2xl overflow-hidden mt-6 border border-slate-800">
              <h3 className="text-base font-bold text-slate-200 mb-4 flex items-center gap-2">
                <Clock className="h-5 w-5 text-brand-400" /> ตารางคิวงาน (Gantt Chart 14 วัน)
              </h3>
              <div className="overflow-x-auto pb-2 custom-scrollbar">
                <div className="min-w-[1200px]">

                  {/* Calendar Header (Dates) */}
                  <div className="flex border-b border-slate-800 pb-2 mb-2">
                    <div className="w-32 flex-shrink-0 font-bold text-xs text-slate-400 pl-2">ดร๊าฟ / วันที่</div>
                    {ganttDates.map((d, i) => {
                      const dateStr = d.toISOString().split('T')[0];
                      const isToday = d.toDateString() === new Date().toDateString();

                      const isSunday = d.getDay() === 0;
                      // ใส่ fallback (|| []) ป้องกันจอดำกรณีที่หาตัวแปร customHolidays ไม่เจอ
                      const isCustomHoliday = (typeof customHolidays !== 'undefined' ? customHolidays : []).includes(dateStr);
                      const isHoliday = isSunday || isCustomHoliday;

                      return (
                        <div
                          key={i}
                          onClick={() => typeof toggleHoliday !== 'undefined' && toggleHoliday(dateStr)}
                          title="คลิกเพื่อตั้ง/ยกเลิก วันหยุดพิเศษ"
                          className={`flex-1 text-center text-[10px] font-bold cursor-pointer transition-all hover:bg-slate-800/50
                            ${isToday ? 'text-brand-400 bg-brand-500/10 rounded py-1 border border-brand-500/20' : 'text-slate-500'} 
                            ${isHoliday && !isToday ? 'text-rose-400 bg-rose-950/20 rounded py-1 border border-rose-900/30' : ''}`}
                        >
                          {d.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' })}
                          {isCustomHoliday && <span className="block text-[8px] text-rose-500 mt-0.5">🛑 วันหยุด</span>}
                        </div>
                      )
                    })}
                  </div>

                  {/* Draft Rows */}
                  {users.filter(u => u.role === 'draft').map(dr => (
                    <div key={dr.id} className="flex items-stretch border-b border-slate-800/50 py-3 hover:bg-slate-900/30 group transition-colors">
                      <div className="w-32 flex-shrink-0 text-xs font-semibold text-slate-200 truncate pr-2 flex items-center pl-2" title={dr.name}>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ['#f43f5e', '#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#3b82f6'][dr.id % 7] }}></span>
                          {dr.name}
                        </div>
                      </div>

                      {/* Cells for each day */}
                      {ganttDates.map((d, i) => {
                        const targetDateStr = d.toISOString().split('T')[0];
                        const dayTasks = [];

                        projects.filter(p => !p.isArchived).forEach(p => {
                          p.floorZones?.forEach(fz => {
                            if (fz.deadline === targetDateStr && !COMPLETED_STATUSES.has(fz.status) && (fz.assignedDraftId || p.draftId) === dr.id) {
                              dayTasks.push({ proj: p, fz: fz });
                            }
                          });
                        });

                        const isSunday = d.getDay() === 0;
                        const isHoliday = isSunday || (typeof customHolidays !== 'undefined' ? customHolidays : []).includes(targetDateStr);
                        const isToday = d.toDateString() === new Date().toDateString();

                        return (
                          <div
                            key={i}
                            // 🌟 บังคับ min-w-0 และใส่ Scrollbar เฉพาะช่องที่งานเยอะ
                            className={`flex-1 min-w-0 flex flex-col gap-1.5 px-1 min-h-[40px] max-h-[140px] overflow-y-auto overflow-x-hidden border-l border-slate-800/30 justify-start items-center pt-1 pb-1
                            ${isToday ? 'bg-brand-950/10' : ''} ${isHoliday ? 'bg-rose-950/10' : ''}`}
                          >
                            {dayTasks.map((task, idx) => {
                              const isOverdue = getDelayRisk(task.fz) === 'OVERDUE';
                              const canEdit = currentUser?.role === 'admin' ||
                                (currentUser?.role === 'engineer' && task.proj.engineerId === currentUser.id) ||
                                (currentUser?.role === 'draft' && (task.fz.assignedDraftId || task.proj.draftId) === currentUser.id);

                              const engName = users.find(u => u.id === task.proj.engineerId)?.name || 'ไม่ระบุ';

                              return (
                                <div
                                  key={task.fz.id}
                                  title={`โครงการ: [${task.proj.projectNumber}] ${task.proj.projectName}\nชั้น/โซน: ${task.fz.name}\nสถานะ: ${task.fz.status}\nวิศวกร: ${engName}`}
                                  // 🌟 ห้ามการ์ดโดนบีบด้วย flex-shrink-0
                                  className={`w-full overflow-hidden flex-shrink-0 text-left rounded-md border p-1 shadow-sm relative transition-transform flex flex-col gap-0.5 ${getStatusStyle(task.fz.status)} ${canEdit ? 'cursor-pointer hover:-translate-y-0.5' : 'cursor-default opacity-60 grayscale-[30%]'}`}
                                  onClick={() => {
                                    if (canEdit) openFloorEditor(task.fz, task.proj);
                                  }}
                                >
                                  <div className="flex items-center gap-1 w-full overflow-hidden">
                                    {isOverdue && <span className="text-red-600 animate-pulse text-[8px] flex-shrink-0">🚨</span>}
                                    <span className="font-extrabold text-[8px] truncate opacity-90 block">
                                      [{task.proj.projectNumber}] {task.proj.projectName}
                                    </span>
                                  </div>

                                  <div className="text-[8px] font-bold truncate opacity-85 pl-0.5 w-full block">
                                    📌 {task.fz.name}
                                  </div>

                                  <div className="text-[7.5px] font-semibold truncate opacity-70 pl-0.5 w-full block">
                                    👨‍🔧 {engName}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-900/60 p-3 mt-4 rounded-xl flex gap-6 text-[10px] text-slate-400 font-medium border border-slate-800 flex-wrap">
                <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-brand-500/20 border border-brand-500/50"></span> วันนี้ (Today)</div>
                <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-rose-950/20 border border-rose-900/30"></span> วันหยุด (อาทิตย์ & วันหยุดพิเศษ)</div>
                <div className="flex items-center gap-1.5">🖱️ คลิกที่การ์ดเพื่อแก้ไข</div>
                <div className="flex items-center gap-1.5 text-brand-300">💡 วิศวกร/Admin สามารถคลิกที่ชื่อ "วัน/เดือน" ด้านบนตาราง เพื่อตั้งค่าเป็นวันหยุดพิเศษได้</div>
              </div>
            </div>
            {/* ======================================================== */}
          </div>
        )}
        {/* ========================================= */}
        {/* TAB 5: ADMIN PANEL (ส่วนที่ระบบขาดไป) */}
        {/* ========================================= */}
        {activeTab === 'admin' && (
  <div className="space-y-6 animate-fadeIn text-left">
    <div className="glass-panel p-6 rounded-2xl border border-slate-800 bg-slate-900/40">
      <h2 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2">
        <Sliders className="h-5 w-5 text-brand-400" /> แผงควบคุมผู้ดูแลระบบ (Admin Control Panel)
      </h2>

      {/* ปุ่มสลับแท็บย่อย (Sub Tabs) */}
      <div className="flex gap-4 border-b border-slate-800 mb-6">
        <button
          onClick={() => setAdminSubTab('users')}
          className={`pb-2 text-xs font-bold border-b-2 transition-all ${
            adminSubTab === 'users' ? 'border-brand-500 text-brand-400' : 'border-transparent text-slate-400'
          }`}
        >
          จัดการผู้ใช้งาน ({adminUsersList.length})
        </button>
        <button
          onClick={() => setAdminSubTab('workload')}
          className={`pb-2 text-xs font-bold border-b-2 transition-all ${
            adminSubTab === 'workload' ? 'border-brand-500 text-brand-400' : 'border-transparent text-slate-400'
          }`}
        >
          ตั้งค่าเกณฑ์ควบคุม Workload
        </button>
      </div>

      {/* ส่วนย่อยที่ 1: ตารางจัดการสิทธิ์ผู้ใช้งาน */}
      {adminSubTab === 'users' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-xs text-slate-400">รายชื่อบัญชีผู้ใช้ทั้งหมดในระบบ</span>
            <button
              onClick={() => setIsCreateUserOpen(true)}
              className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold rounded-lg flex items-center gap-1 shadow-md shadow-brand-500/10 transition-all"
            >
              <UserPlus className="h-3.5 w-3.5" /> เพิ่มผู้ใช้งานใหม่
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800/80">
            <table className="w-full text-xs text-left text-slate-300">
              <thead className="bg-slate-950 text-slate-400 font-mono border-b border-slate-800">
                <tr>
                  <th className="p-3">ชื่อ-นามสกุล</th>
                  <th className="p-3">อีเมลบัญชี</th>
                  <th className="p-3">ตำแหน่ง (Role)</th>
                  <th className="p-3 text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900 bg-slate-900/20">
                {adminUsersList.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="p-4 text-center text-slate-500 italic">ไม่พบข้อมูลผู้ใช้งาน</td>
                  </tr>
                ) : (
                  adminUsersList.map(u => (
                    <tr key={u.id} className="hover:bg-slate-900/40 transition-colors">
                      <td className="p-3 font-semibold text-slate-200">{u.name}</td>
                      <td className="p-3 font-mono text-slate-400">{u.email}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          u.role === 'admin' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                          u.role === 'engineer' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                          'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                          {u.role.toUpperCase()}
                        </span>
                      </td>
                      <td className="p-3 text-right space-x-2">
                        <button
                          onClick={() => {
                            setSelectedUserForEdit(u);
                            setUserFormName(u.name);
                            setUserFormEmail(u.email);
                            setUserFormRole(u.role);
                            setUserFormPassword('');
                            setIsEditUserOpen(true);
                          }}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-medium transition-colors"
                        >
                          แก้ไข
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u.id)}
                          className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded font-medium transition-colors"
                        >
                          ลบ
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ส่วนย่อยที่ 2: ฟอร์มตั้งค่าสูตรคำนวณภาระงาน (Workload) */}
      {adminSubTab === 'workload' && (
        <form onSubmit={handleSaveSettings} className="space-y-4 max-w-md">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              จำนวนชั่วโมงเฉลี่ย ต่อการทำแบบ 1 แผ่น (ชั้นย่อย)
            </label>
            <input
              type="number" step="0.1" required
              className="glass-input w-full px-3 py-2 rounded-lg text-xs text-slate-200"
              value={cfgHoursPerSheet} onChange={(e) => setCfgHoursPerSheet(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              ขีดจำกัดจำนวนแผ่นสูงสุดสะสมต่อคน (Max Sheets Threshold)
            </label>
            <input
              type="number" required
              className="glass-input w-full px-3 py-2 rounded-lg text-xs text-slate-200"
              value={cfgMaxSheets} onChange={(e) => setCfgMaxSheets(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              จำนวนวันแจ้งเตือนความเสี่ยงล่วงหน้า (Warning Days Thresholdก่อนเดดไลน์)
            </label>
            <input
              type="number" required
              className="glass-input w-full px-3 py-2 rounded-lg text-xs text-slate-200"
              value={cfgWarningDays} onChange={(e) => setCfgWarningDays(e.target.value)}
            />
          </div>
          
          <div className="pt-2">
            <button
              type="submit"
              className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold rounded-lg shadow-md transition-all flex items-center gap-1"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> บันทึกข้อกำหนดระบบ
            </button>
          </div>
        </form>
      )}

    </div>
  </div>
)}
        {/* CREATE PROJECT MODAL */}
        {isCreateProjectOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <div className="glass-panel w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-slate-800 animate-scaleUp">
              <div className="px-6 py-4 bg-slate-900 border-b border-slate-800 flex justify-between items-center">
                <h3 className="font-bold text-slate-200">สร้างแบบแปลนและโครงสร้างแผนงาน (Grid Plan)</h3>
                <button onClick={() => setIsCreateProjectOpen(false)} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
              </div>
              <form onSubmit={handleCreateProject}>
                <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto text-left">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">เลขที่โครงการ *</label>
                      <input type="text" required placeholder="เช่น P2601" className="glass-input w-full px-3 py-2 rounded-lg text-sm text-slate-200 font-mono"
                        value={newProjectNumber} onChange={(e) => setNewProjectNumber(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">ชื่อโครงการ *</label>
                      <input type="text" required placeholder="เช่น โครงการคอนโดมิเนียมแกรนด์แวลลีย์" className="glass-input w-full px-3 py-2 rounded-lg text-sm text-slate-200"
                        value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">วิศวกรผู้ควบคุม</label>
                      {currentUser?.role === 'engineer' ? (
                        <input
                          type="text"
                          readOnly
                          className="glass-input w-full px-3 py-2 rounded-lg text-sm text-slate-300 font-semibold opacity-80"
                          value={currentUser.name}
                        />
                      ) : (
                        <select className="glass-input w-full px-3 py-2 rounded-lg text-sm text-slate-350 font-semibold"
                          value={newEngineerId} onChange={(e) => setNewEngineerId(e.target.value)}>
                          <option value="">เลือกวิศวกร</option>
                          {users.filter(u => u.role === 'engineer').map(eng => <option key={eng.id} value={eng.id}>{eng.name}</option>)}
                        </select>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">ผู้จัดทำแบบ (Draftsperson)</label>
                      <select className="glass-input w-full px-3 py-2 rounded-lg text-sm text-slate-350 font-semibold"
                        value={newDraftId} onChange={(e) => setNewDraftId(e.target.value)}>
                        <option value="">เลือกดร๊าฟแบบ</option>
                        {users.filter(u => u.role === 'draft').map(dr => <option key={dr.id} value={dr.id}>{dr.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="p-4 bg-slate-900/40 border border-slate-800 rounded-xl space-y-3">
                    <label className="block text-xs font-bold text-brand-300 uppercase">รายชื่อชั้น/โซนที่ต้องสร้าง (แยกด้วย , หรือช่วง 1-5) * 1 ชั้น = 1 แผ่นเสมอ</label>

                    {/* 🌟 จัดกลุ่ม Input และ Checkbox ไว้ด้วยกัน */}
                    <div className="space-y-2">
                      <input type="text" className="glass-input w-full px-3 py-2 rounded-lg text-sm text-slate-200 font-bold"
                        placeholder="1-3, 11, 14-16 หรือ Floor 1, Floor 2"
                        value={newFloorInputText} onChange={(e) => setNewFloorInputText(e.target.value)} />

                      {/* 🌟 จุดที่เพิ่ม Checkbox เข้ามา */}
                      <label className="flex items-center gap-2 cursor-pointer text-slate-400 hover:text-slate-200 transition-colors">
                        <input
                          type="checkbox"
                          checked={autoExpandFloors}
                          onChange={e => setAutoExpandFloors(e.target.checked)}
                          className="w-3.5 h-3.5 accent-brand-500 rounded border-slate-600"
                        />
                        <span className="text-[11px] font-semibold">ขยายช่วงอัตโนมัติ (เช่น พิมพ์ `2-5` จะแยกสร้างเป็นชั้น 2, 3, 4, 5 ให้)</span>
                      </label>
                    </div>

                    <div>
                      <label className="block text-[10px] text-slate-400 uppercase">กำหนดเดดไลน์ของทุกชั้น (ปล่อยว่างได้)</label>
                      <input type="date" className="glass-input w-full px-3 py-1.5 rounded text-sm text-slate-300"
                        value={defaultDeadline} onChange={(e) => setDefaultDeadline(e.target.value)} />
                    </div>
                  </div>
                </div>
                <div className="px-6 py-4 bg-slate-900 border-t border-slate-800 flex justify-end gap-3">
                  <button type="button" onClick={() => setIsCreateProjectOpen(false)} className="px-4 py-2 text-slate-400 text-sm">ยกเลิก</button>
                  <button type="submit" className="px-5 py-2 bg-brand-600 rounded text-white font-bold text-sm hover:bg-brand-500 transition-colors">สร้างคิวโครงการ & Grid</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* FLOOR EDIT MODAL */}
        {isFloorEditOpen && selectedFloor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <div className="glass-panel w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden border border-slate-800 flex flex-col md:flex-row animate-scaleUp">

              <div className="flex-grow p-6 space-y-4 border-r border-slate-800 text-left">
                <div className="flex justify-between items-center border-b border-slate-800 pb-3 mb-4">
                  <h3 className="font-bold text-slate-200 text-base flex items-center gap-2">
                    <Wrench className="h-5 w-5 text-brand-400" />
                    แผงจัดการแก้ไขชั้นงานย่อย (Floor Editor)
                  </h3>

                  {currentUser && currentUser.role === 'engineer' && (
                    <button
                      type="button"
                      onClick={(e) => handleSoftDeleteFloorZone(selectedFloor.id, e)}
                      className="p-2 hover:bg-slate-900 border border-transparent hover:border-rose-500 rounded-lg text-slate-400 hover:text-rose-500 transition-all flex items-center gap-1"
                      title="ลบชั้นย่อยนี้"
                    >
                      <Trash2 className="h-4 w-4 animate-fadeIn" /> <span className="text-xs font-bold">ลบชั้นงาน (Soft Delete)</span>
                    </button>
                  )}
                </div>

                <form onSubmit={handleUpdateFloorZone} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">ชื่อชั้น / โซนร่างแบบ</label>
                      <input type="text" className="glass-input w-full px-3 py-2 rounded-lg text-sm text-slate-200 font-bold"
                        value={editFloorName} onChange={(e) => setEditFloorName(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">กำหนดเดดไลน์ส่งแบบ</label>
                      <input type="date" className="glass-input w-full px-3 py-2 rounded-lg text-sm text-slate-350"
                        value={editFloorDeadline} onChange={(e) => setEditFloorDeadline(e.target.value)} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">มอบหมายดร๊าฟผู้รับผิดชอบ</label>
                      {currentUser && currentUser.role === 'draft' ? (
                        <input
                          type="text"
                          readOnly
                          className="glass-input w-full px-3 py-2 rounded-lg text-sm text-slate-300 opacity-80"
                          value={users.find(u => u.id === parseInt(editAssignedDraftId || editFloorProjectDraftId, 10))?.name || 'ไม่ระบุ'}
                        />
                      ) : (
                        <select
                          className="glass-input w-full px-3 py-2 rounded-lg text-sm text-slate-300 font-semibold"
                          value={editAssignedDraftId}
                          onChange={(e) => setEditAssignedDraftId(e.target.value)}
                        >
                          <option value="">ใช้ดร๊าฟเดิมของโครงการ</option>
                          {users.filter(u => u.role === 'draft').map(dr => (
                            <option key={dr.id} value={dr.id}>{dr.name}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">ปรับเปลี่ยนตามช่วงสถานะงานคิว (Status Flow)</label>
                    <div className="grid grid-cols-3 gap-2">
                      {STATUS_FLOW.map(st => {
                        const isActive = editFloorStatus === st;
                        return (
                          <button key={st} type="button" onClick={() => setEditFloorStatus(st)}
                            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all border ${isActive ? 'bg-brand-600 border-brand-500 text-white shadow' : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'}`}>
                            {st}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">หมายเหตุเพิ่มเติม</label>
                    <textarea
                      rows="2"
                      className="glass-input w-full px-3 py-2 rounded-lg text-sm text-slate-200"
                      value={editFloorNotes}
                      onChange={(e) => setEditFloorNotes(e.target.value)}
                      readOnly={currentUser && currentUser.role === 'draft'}
                    ></textarea>
                    {currentUser && currentUser.role === 'draft' && (
                      <p className="text-[10px] text-amber-400 mt-1">สถานะ Draft ดู Note ได้อย่างเดียว ไม่สามารถแก้ไขได้</p>
                    )}
                  </div>

                  <div className="flex justify-end gap-3 pt-4">
                    <button type="button" onClick={() => setIsFloorEditOpen(false)} className="px-4 py-2 text-slate-400 text-sm">ยกเลิก</button>
                    <button type="submit" className="px-5 py-2 bg-brand-600 rounded text-white font-bold text-sm">บันทึกการเปลี่ยนแปลง</button>
                  </div>
                </form>
              </div>

              {/* Audit History Log */}
              <div className="w-full md:w-80 p-6 bg-slate-950 flex flex-col max-h-[85vh] overflow-y-auto text-left">
                <h3 className="font-bold text-slate-200 text-sm mb-4 border-b border-slate-800 pb-3">ประวัติความคืบหน้า (Audit Trail)</h3>
                <div className="space-y-4">
                  {floorHistory.length === 0 ? (
                    <p className="text-xs text-slate-500 italic py-8 text-center">ไม่มีบันทึกประวัติก่อนหน้านี้</p>
                  ) : (
                    floorHistory.map(log => (
                      <div key={log.id} className="relative pl-5 border-l border-slate-850 pb-2">
                        <div className="absolute top-1 -left-1.5 h-3 w-3 rounded-full bg-brand-500 border-2 border-slate-950"></div>
                        <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 text-[11px]">
                          <span className="font-bold text-slate-300 block">{log.changedByUser?.name || 'ระบบอัตโนมัติ'}</span>
                          <div className="flex items-center gap-1.5 font-bold text-brand-300 mt-1">
                            {log.oldStatus && <span className="text-slate-400 font-normal">{log.oldStatus} ➡️ </span>}
                            <span>{log.newStatus}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* CREATE USER MODAL (ADMIN ONLY) */}
        {isCreateUserOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <div className="glass-panel w-full max-w-md rounded-2xl p-6 border border-slate-800 animate-scaleUp text-left">
              <div className="flex justify-between items-center border-b border-slate-850 pb-2.5 mb-4">
                <h3 className="font-bold text-slate-200 text-sm flex items-center gap-2">
                  <UserPlus className="h-4.5 w-4.5 text-brand-400" /> สร้างรายชื่อผู้ใช้งานใหม่
                </h3>
                <button onClick={() => setIsCreateUserOpen(false)} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
              </div>
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">ชื่อ-นามสกุลผู้ใช้</label>
                  <input
                    type="text" required placeholder="เช่น ศุภฤกษ์ ตรงจิตสุนทร"
                    className="glass-input w-full px-3 py-2 rounded-lg text-xs text-slate-200"
                    value={userFormName} onChange={(e) => setUserFormName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">อีเมลทางการ</label>
                  <input
                    type="email" required placeholder="name@syncdraft.com"
                    className="glass-input w-full px-3 py-2 rounded-lg text-xs text-slate-200 font-mono"
                    value={userFormEmail} onChange={(e) => setUserFormEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">รหัสผ่านเริ่มต้น</label>
                  <input
                    type="password" required placeholder="••••••"
                    className="glass-input w-full px-3 py-2 rounded-lg text-xs text-slate-200"
                    value={userFormPassword} onChange={(e) => setUserFormPassword(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">บทบาทหน้าที่ (Role)</label>
                  <select
                    className="glass-input w-full px-3 py-2 rounded-lg text-xs text-slate-300 font-semibold"
                    value={userFormRole} onChange={(e) => setUserFormRole(e.target.value)}
                  >
                    <option value="engineer">วิศวกร (Engineer)</option>
                    <option value="draft">ดร๊าฟแบบ (Draftsperson)</option>
                    <option value="admin">ผู้ดูแลระบบ (Admin)</option>
                  </select>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setIsCreateUserOpen(false)} className="px-4 py-2 text-slate-400 text-xs">ยกเลิก</button>
                  <button type="submit" className="px-4 py-2 bg-brand-600 rounded text-white font-bold text-xs">ยืนยันสร้างบัญชี</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* EDIT USER / PASSWORD MODAL (ADMIN ONLY) */}
        {isEditUserOpen && selectedUserForEdit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
            <div className="glass-panel w-full max-w-md rounded-2xl p-6 border border-slate-800 animate-scaleUp text-left">
              <div className="flex justify-between items-center border-b border-slate-850 pb-2.5 mb-4">
                <h3 className="font-bold text-slate-200 text-sm flex items-center gap-2">
                  <KeyRound className="h-4.5 w-4.5 text-brand-400" /> แก้ไขโปรไฟล์ / สั่งรีเซ็ตรหัสผ่าน
                </h3>
                <button onClick={() => { setIsEditUserOpen(false); setSelectedUserForEdit(null); }} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
              </div>
              <form onSubmit={handleEditUserSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">ชื่อ-นามสกุล</label>
                  <input
                    type="text" required
                    className="glass-input w-full px-3 py-2 rounded-lg text-xs text-slate-200"
                    value={userFormName} onChange={(e) => setUserFormName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">อีเมลผู้ใช้งาน</label>
                  <input
                    type="email" required
                    className="glass-input w-full px-3 py-2 rounded-lg text-xs text-slate-200 font-mono"
                    value={userFormEmail} onChange={(e) => setUserFormEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">เปลี่ยนรหัสผ่าน (กรอกเฉพาะเมื่อต้องการตั้งใหม่)</label>
                  <input
                    type="password" placeholder="ว่างไว้หากใช้รหัสเดิม"
                    className="glass-input w-full px-3 py-2 rounded-lg text-xs text-slate-200 animate-fadeIn"
                    value={userFormPassword} onChange={(e) => setUserFormPassword(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">บทบาทหน้าที่ (Role)</label>
                  <select
                    className="glass-input w-full px-3 py-2 rounded-lg text-xs text-slate-300 font-semibold"
                    value={userFormRole} onChange={(e) => setUserFormRole(e.target.value)}
                  >
                    <option value="engineer">วิศวกร (Engineer)</option>
                    <option value="draft">ดร๊าฟแบบ (Draftsperson)</option>
                    <option value="admin">ผู้ดูแลระบบ (Admin)</option>
                  </select>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => { setIsEditUserOpen(false); setSelectedUserForEdit(null); }} className="px-4 py-2 text-slate-400 text-xs">ยกเลิก</button>
                  <button type="submit" className="px-4 py-2 bg-brand-600 rounded text-white font-bold text-xs">บันทึกข้อมูล</button>
                </div>
              </form>
            </div>
          </div>
        )}
        {/* ========================================= */}
        {/* MODAL: ดูรายละเอียดงานในปฏิทิน (ข้อ 3) */}
        {/* ========================================= */}
        {selectedEvent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl relative">
              <button
                onClick={() => setSelectedEvent(null)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white"
              >
                ✕
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="p-3 rounded-xl bg-brand-500/20 text-brand-400">
                  <Calendar className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white">{selectedEvent.projectName}</h3>
                  <p className="text-slate-400">โซน/ชั้น: <span className="text-white">{selectedEvent.title.replace(/\[.*?\] /, '')}</span></p>
                </div>
              </div>

              <div className="space-y-3 bg-slate-800/50 p-4 rounded-xl text-sm">
                <div className="flex justify-between border-b border-slate-700 pb-2">
                  <span className="text-slate-400">👨‍🔧 วิศวกร:</span>
                  <span className="text-slate-200 font-medium">{selectedEvent.engName}</span>
                </div>
                <div className="flex justify-between border-b border-slate-700 pb-2">
                  <span className="text-slate-400">📐 ผู้เขียนแบบ:</span>
                  <span className="text-slate-200 font-medium">{selectedEvent.draftName}</span>
                </div>
                <div className="flex justify-between border-b border-slate-700 pb-2">
                  <span className="text-slate-400">⏳ สถานะ:</span>
                  <span className="text-brand-400 font-medium">{selectedEvent.status}</span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="text-slate-400">📅 กำหนดส่ง:</span>
                  <span className={`${selectedEvent.isOverdue ? 'text-red-400 font-bold' : 'text-slate-200'}`}>
                    {selectedEvent.isOverdue && "🚨 "}
                    {new Date(selectedEvent.start).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setSelectedEvent(null)}
                className="mt-6 w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
