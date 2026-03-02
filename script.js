// IndexedDB 数据库配置
const DB_NAME = 'NotesDB';
const DB_VERSION = 1;
const STORE_NAME = 'notes';

// 全局变量
let currentCategory = '';
let editingNoteId = null;
let db = null;
let touchStartX = 0;
let touchStartY = 0;
let isScrolling = false;

// 检测是否在iOS设备上
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
// 检测是否在微信环境中
const isWeChat = /MicroMessenger/i.test(navigator.userAgent);

// 安全的console.log包装函数
function safeLog(message) {
  if (typeof console !== 'undefined' && console.log) {
    console.log(message);
  }
}

// 初始化数据库
function initDB() {
  return new Promise((resolve, reject) => {
    try {
      // 检查浏览器是否支持IndexedDB
      if (!window.indexedDB) {
        safeLog('浏览器不支持IndexedDB，使用localStorage作为后备方案');
        resolve({ type: 'localStorage' });
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = (event) => {
        safeLog('IndexedDB初始化失败:', event.target.error);
        // 如果是iOS设备且IndexedDB失败，使用localStorage作为后备方案
        if (isIOS) {
          safeLog('iOS设备IndexedDB失败，使用localStorage作为后备方案');
          resolve({ type: 'localStorage' });
        } else {
          reject(event.target.error);
        }
      };
      
      request.onsuccess = (event) => {
        safeLog('IndexedDB初始化成功');
        db = event.target.result;
        resolve(db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          // 创建索引以提高查询性能
          store.createIndex('by_category', 'category', { unique: false });
          store.createIndex('by_date', 'date', { unique: false });
          safeLog('创建对象存储成功');
        }
      };
    } catch (error) {
      safeLog('初始化数据库时发生错误:', error);
      // 发生任何错误都使用localStorage作为后备方案
      resolve({ type: 'localStorage' });
    }
  });
}

// 数据库操作函数
async function getDB() {
  if (!db) {
    db = await initDB();
  }
  return db;
}

// 从localStorage获取所有笔记
function getAllNotesFromLocalStorage() {
  try {
    const notes = localStorage.getItem('notes');
    return notes ? JSON.parse(notes) : [];
  } catch (error) {
    safeLog('从localStorage读取笔记失败:', error);
    return [];
  }
}

// 保存笔记到localStorage
function saveNoteToLocalStorage(note) {
  try {
    const notes = getAllNotesFromLocalStorage();
    const existingIndex = notes.findIndex(n => n.id === note.id);
    
    if (existingIndex >= 0) {
      notes[existingIndex] = note;
    } else {
      notes.push(note);
    }
    
    localStorage.setItem('notes', JSON.stringify(notes));
    return note.id;
  } catch (error) {
    safeLog('保存笔记到localStorage失败:', error);
    throw error;
  }
}

// 从localStorage删除笔记
function deleteNoteFromLocalStorage(id) {
  try {
    const notes = getAllNotesFromLocalStorage();
    const filteredNotes = notes.filter(n => n.id !== id);
    localStorage.setItem('notes', JSON.stringify(filteredNotes));
  } catch (error) {
    safeLog('从localStorage删除笔记失败:', error);
    throw error;
  }
}

// 从localStorage获取特定笔记
function getNoteFromLocalStorage(id) {
  try {
    const notes = getAllNotesFromLocalStorage();
    return notes.find(n => n.id === id);
  } catch (error) {
    safeLog('从localStorage获取笔记失败:', error);
    return null;
  }
}

async function getAllNotes() {
  const database = await getDB();
  
  if (database.type === 'localStorage') {
    return getAllNotesFromLocalStorage();
  }
  
  return new Promise((resolve, reject) => {
    try {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => {
        safeLog('获取笔记失败:', event.target.error);
        reject(event.target.error);
      };
    } catch (error) {
      safeLog('IndexedDB操作失败，切换到localStorage:', error);
      resolve(getAllNotesFromLocalStorage());
    }
  });
}

async function getNoteById(id) {
  const database = await getDB();
  
  if (database.type === 'localStorage') {
    return getNoteFromLocalStorage(id);
  }
  
  return new Promise((resolve, reject) => {
    try {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => {
        safeLog('获取笔记失败:', event.target.error);
        // 如果IndexedDB失败，尝试使用localStorage
        try {
          const note = getNoteFromLocalStorage(id);
          resolve(note);
        } catch (localError) {
          reject(event.target.error);
        }
      };
    } catch (error) {
      safeLog('IndexedDB操作失败，切换到localStorage:', error);
      resolve(getNoteFromLocalStorage(id));
    }
  });
}

async function saveNoteToDB(note) {
  const database = await getDB();
  
  if (database.type === 'localStorage') {
    return saveNoteToLocalStorage(note);
  }
  
  return new Promise((resolve, reject) => {
    try {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(note);
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = (event) => {
        safeLog('保存笔记失败:', event.target.error);
        // 如果IndexedDB失败，尝试使用localStorage
        try {
          const result = saveNoteToLocalStorage(note);
          resolve(result);
        } catch (localError) {
          reject(event.target.error);
        }
      };
    } catch (error) {
      safeLog('IndexedDB操作失败，切换到localStorage:', error);
      resolve(saveNoteToLocalStorage(note));
    }
  });
}

async function deleteNoteFromDB(id) {
  const database = await getDB();
  
  if (database.type === 'localStorage') {
    return deleteNoteFromLocalStorage(id);
  }
  
  return new Promise((resolve, reject) => {
    try {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);
      
      request.onsuccess = () => resolve();
      request.onerror = (event) => {
        safeLog('删除笔记失败:', event.target.error);
        // 如果IndexedDB失败，尝试使用localStorage
        try {
          deleteNoteFromLocalStorage(id);
          resolve();
        } catch (localError) {
          reject(event.target.error);
        }
      };
    } catch (error) {
      safeLog('IndexedDB操作失败，切换到localStorage:', error);
      deleteNoteFromLocalStorage(id);
      resolve();
    }
  });
}

// 主题切换
const themeInput = document.getElementById('themeColor');
themeInput.addEventListener('input', () => {
  document.documentElement.style.setProperty('--primary-color', themeInput.value);
  document.documentElement.style.setProperty('--secondary-color', adjustBrightness(themeInput.value, -20));
  localStorage.setItem('theme', themeInput.value);
});

// 调整颜色亮度
function adjustBrightness(color, percent) {
  const num = parseInt(color.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = (num >> 8 & 0x00FF) + amt;
  const B = (num & 0x0000FF) + amt;
  return '#' + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
    (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
    (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
}

// 加载主题
window.onload = async () => {
  const savedTheme = localStorage.getItem('theme') || '#2196F3';
  document.documentElement.style.setProperty('--primary-color', savedTheme);
  document.documentElement.style.setProperty('--secondary-color', adjustBrightness(savedTheme, -20));
  themeInput.value = savedTheme;
  
  await initApp();
};

// 初始化应用
async function initApp() {
  try {
    safeLog('开始初始化应用...');
    
    // 显示加载状态
    const container = document.getElementById('notesList');
    if (container) {
      container.innerHTML = `
        <div class="empty-state">
          <p>正在加载笔记...</p>
        </div>
      `;
    }
    
    // 延迟初始化，确保DOM完全加载
    setTimeout(async () => {
      try {
        await renderNotes();
        await updateCategoryCounts();
        bindEvents();
        initializeCategoryFilter();
        
        safeLog('应用初始化成功');
        
        // 为iOS设备添加特殊处理
        if (isIOS) {
          safeLog('检测到iOS设备，应用特殊优化');
          // 修复iOS Safari的滚动问题
          document.body.style.overflow = 'auto';
          document.body.style.position = 'relative';
        }
        
        // 为微信环境添加特殊处理
        if (isWeChat) {
          safeLog('检测到微信环境，应用特殊优化');
          // 禁用微信的默认下拉刷新
          document.addEventListener('touchmove', (e) => {
            if (e.touches.length > 1) {
              e.preventDefault();
            }
          }, { passive: false });
        }
        
      } catch (initError) {
        safeLog('应用初始化失败:', initError);
        if (container) {
          container.innerHTML = `
            <div class="empty-state">
              <p>加载失败，请刷新页面重试</p>
            </div>
          `;
        }
      }
    }, 100);
    
  } catch (error) {
    safeLog('应用初始化失败:', error);
    alert('应用初始化失败，请刷新页面重试');
  }
}

// 初始化分类筛选下拉框
function initializeCategoryFilter() {
  const filterSelect = document.getElementById('categoryFilter');
  const categories = ['', '工作', '生活', '学习'];
  
  filterSelect.innerHTML = '';
  categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category || '选择分类';
    filterSelect.appendChild(option);
  });
}

// 绑定事件
function bindEvents() {
  try {
    // 侧边栏切换 - 支持触摸事件
    const sidebarToggle = document.querySelector('.sidebar-toggle');
    if (sidebarToggle) {
      sidebarToggle.addEventListener('click', toggleSidebar);
      sidebarToggle.addEventListener('touchstart', (e) => {
        e.preventDefault();
        toggleSidebar();
      }, { passive: false });
    }
    
    // 搜索功能
    const searchInput = document.getElementById('search');
    if (searchInput) {
      searchInput.addEventListener('input', handleSearch);
      searchInput.addEventListener('change', handleSearch); // 确保在移动设备上也能触发
    }
    
    const dateFilter = document.getElementById('dateFilter');
    if (dateFilter) {
      dateFilter.addEventListener('change', handleDateFilter);
    }
    
    const categoryFilter = document.getElementById('categoryFilter');
    if (categoryFilter) {
      categoryFilter.addEventListener('change', handleCategoryFilter);
    }
    
    // 侧边栏搜索功能
    const sidebarSearch = document.getElementById('sidebarSearch');
    const sidebarDateFilter = document.getElementById('sidebarDateFilter');
    
    if (sidebarSearch) {
      sidebarSearch.addEventListener('input', handleSearch);
      sidebarSearch.addEventListener('change', handleSearch);
    }
    
    if (sidebarDateFilter) {
      sidebarDateFilter.addEventListener('change', handleDateFilter);
    }
    
    // 分类点击事件 - 支持触摸事件
    document.querySelectorAll('.category-item').forEach(item => {
      if (!item.classList.contains('add-category')) {
        item.addEventListener('click', () => {
          const category = item.dataset.category;
          selectCategory(category);
        });
        
        item.addEventListener('touchstart', (e) => {
          e.preventDefault();
          const category = item.dataset.category;
          selectCategory(category);
        }, { passive: false });
      }
    });
    
    // 悬浮按钮事件 - 支持触摸事件
    const floatingBtn = document.querySelector('.floating-add-btn');
    if (floatingBtn) {
      floatingBtn.addEventListener('click', showAddDialog);
      floatingBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        showAddDialog();
      }, { passive: false });
    }
    
    // 模态框关闭按钮 - 支持触摸事件
    document.querySelectorAll('.close').forEach(closeBtn => {
      closeBtn.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal');
        if (modal) {
          modal.classList.remove('show');
        }
      });
      
      closeBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const modal = e.target.closest('.modal');
        if (modal) {
          modal.classList.remove('show');
        }
      }, { passive: false });
    });
    
    // 模态框外部点击关闭
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('show');
        }
      });
      
      modal.addEventListener('touchstart', (e) => {
        if (e.target === modal) {
          e.preventDefault();
          modal.classList.remove('show');
        }
      }, { passive: false });
    });
    
    // 保存按钮事件
    const saveBtn = document.getElementById('saveNote');
    if (saveBtn) {
      saveBtn.addEventListener('click', saveNote);
      saveBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        saveNote();
      }, { passive: false });
    }
    
    // 取消按钮事件
    const cancelBtn = document.getElementById('cancelNote');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        document.getElementById('noteModal').classList.remove('show');
        resetForm();
      });
      
      cancelBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        document.getElementById('noteModal').classList.remove('show');
        resetForm();
      }, { passive: false });
    }
    
    // 移动端导航按钮事件
    const mobileNavBtns = document.querySelectorAll('.mobile-nav-btn');
    mobileNavBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        handleMobileNav(action);
      });
      
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const action = btn.dataset.action;
        handleMobileNav(action);
      }, { passive: false });
    });
    
    safeLog('事件绑定成功');
  } catch (error) {
    safeLog('绑定事件时发生错误:', error);
  }
}

// 侧边栏切换（仅桌面端）
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const mainContent = document.getElementById('mainContent');
  const isMobile = window.innerWidth <= 768;
  
  // 仅在桌面端执行折叠/展开操作
  if (!isMobile) {
    sidebar.classList.toggle('collapsed');
    mainContent.classList.toggle('collapsed');
  }
}

// 选择分类
async function selectCategory(category) {
  currentCategory = category;
  
  // 更新选中状态
  document.querySelectorAll('.category-item').forEach(item => {
    item.classList.remove('active');
    if (item.dataset.category === category) {
      item.classList.add('active');
    }
  });
  
  // 更新标题
  const title = document.getElementById('current-category-title');
  switch(category) {
    case '':
      title.textContent = '全部笔记';
      break;
    case '工作':
      title.textContent = '工作笔记';
      break;
    case '生活':
      title.textContent = '生活笔记';
      break;
    case '学习':
      title.textContent = '学习笔记';
      break;
    default:
      title.textContent = category + '笔记';
  }
  
  // 渲染笔记
  await renderNotes();
}

// 处理搜索
async function handleSearch() {
  // 同步两个搜索框的值
  const mainSearch = document.getElementById('search');
  const sidebarSearch = document.getElementById('sidebarSearch');
  
  if (mainSearch && sidebarSearch) {
    if (event.target === mainSearch) {
      sidebarSearch.value = mainSearch.value;
    } else if (event.target === sidebarSearch) {
      mainSearch.value = sidebarSearch.value;
    }
  }
  
  await renderNotes();
}

// 处理日期筛选
async function handleDateFilter() {
  // 同步两个日期选择器的值
  const mainDateFilter = document.getElementById('dateFilter');
  const sidebarDateFilter = document.getElementById('sidebarDateFilter');
  
  if (mainDateFilter && sidebarDateFilter) {
    if (event.target === mainDateFilter) {
      sidebarDateFilter.value = mainDateFilter.value;
    } else if (event.target === sidebarDateFilter) {
      mainDateFilter.value = sidebarDateFilter.value;
    }
  }
  
  await renderNotes();
}

// 处理分类筛选
async function handleCategoryFilter() {
  const categoryFilter = document.getElementById('categoryFilter');
  const category = categoryFilter.value;
  
  // 更新侧边栏选中状态
  document.querySelectorAll('.category-item').forEach(item => {
    item.classList.remove('active');
    if (item.dataset.category === category) {
      item.classList.add('active');
    }
  });
  
  currentCategory = category;
  
  // 更新标题
  const title = document.getElementById('current-category-title');
  switch(category) {
    case '':
      title.textContent = '全部笔记';
      break;
    case '工作':
      title.textContent = '工作笔记';
      break;
    case '生活':
      title.textContent = '生活笔记';
      break;
    case '学习':
      title.textContent = '学习笔记';
      break;
    default:
      title.textContent = category + '笔记';
  }
  
  await renderNotes();
}

// 渲染笔记列表
async function renderNotes() {
  try {
    const notes = await getAllNotes();
    const container = document.getElementById('notesList');
    const searchInput = document.getElementById('search');
    const dateFilter = document.getElementById('dateFilter');
    
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const dateFilterValue = dateFilter ? dateFilter.value : '';
    
    // 筛选笔记
    let filteredNotes = notes;
    
    // 按分类筛选
    if (currentCategory) {
      filteredNotes = filteredNotes.filter(note => note.category === currentCategory);
    }
    
    // 按搜索词筛选
    if (searchTerm) {
      filteredNotes = filteredNotes.filter(note => 
        note.title.toLowerCase().includes(searchTerm) || 
        note.content.toLowerCase().includes(searchTerm)
      );
    }
    
    // 按日期筛选
    if (dateFilterValue) {
      const filterDate = new Date(dateFilterValue);
      filterDate.setHours(0, 0, 0, 0);
      
      filteredNotes = filteredNotes.filter(note => {
        const noteDate = new Date(note.date);
        noteDate.setHours(0, 0, 0, 0);
        return noteDate.getTime() === filterDate.getTime();
      });
    }
    
    // 按日期排序（最新的在前）
    filteredNotes.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    if (filteredNotes.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>暂无笔记</p>
          <button onclick="showAddDialog()" class="add-note-btn">
            <i class="fa fa-plus"></i> 添加笔记
          </button>
        </div>
      `;
      
      // 绑定新添加按钮的触摸事件
      const addBtn = container.querySelector('.add-note-btn');
      if (addBtn) {
        addBtn.addEventListener('touchstart', (e) => {
          e.preventDefault();
          showAddDialog();
        }, { passive: false });
      }
    } else {
      container.innerHTML = filteredNotes.map(note => `
        <div class="note-card" data-id="${note.id}" 
             ontouchstart="handleNoteTouchStart(event)" 
             ontouchmove="handleNoteTouchMove(event)" 
             ontouchend="handleNoteTouchEnd(event)">
          <div class="note-header">
            <h3 class="note-title">${escapeHtml(note.title)}</h3>
            <span class="note-category ${getCategoryClass(note.category)}">${escapeHtml(note.category)}</span>
          </div>
          <p class="note-content">${escapeHtml(truncateText(note.content, 100))}</p>
          <div class="note-footer">
            <span class="note-date">${formatDate(note.date)}</span>
            <div class="note-actions">
              <button onclick="editNote('${note.id}')" class="action-btn edit-btn" title="编辑">
                <i class="fa fa-pencil"></i>
              </button>
              <button onclick="deleteNote('${note.id}')" class="action-btn delete-btn" title="删除">
                <i class="fa fa-trash"></i>
              </button>
            </div>
          </div>
        </div>
      `).join('');
      
      // 重新绑定笔记卡片的事件
      bindNoteCardEvents();
    }
    
    // 更新分类计数
    await updateCategoryCounts();
    
  } catch (error) {
    safeLog('渲染笔记失败:', error);
    const container = document.getElementById('notesList');
    container.innerHTML = `
      <div class="empty-state">
        <p>加载失败，请刷新页面重试</p>
      </div>
    `;
  }
}

// 绑定笔记卡片事件
function bindNoteCardEvents() {
  const noteCards = document.querySelectorAll('.note-card');
  
  noteCards.forEach(card => {
    // 编辑按钮事件
    const editBtn = card.querySelector('.edit-btn');
    if (editBtn) {
      editBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const noteId = card.dataset.id;
        editNote(noteId);
      }, { passive: false });
    }
    
    // 删除按钮事件
    const deleteBtn = card.querySelector('.delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const noteId = card.dataset.id;
        deleteNote(noteId);
      }, { passive: false });
    }
  });
}

// 触摸事件处理 - 防止滑动时打开笔记
function handleNoteTouchStart(event) {
  touchStartX = event.touches[0].clientX;
  touchStartY = event.touches[0].clientY;
  isScrolling = false;
}

function handleNoteTouchMove(event) {
  if (!touchStartX || !touchStartY) return;
  
  const touchX = event.touches[0].clientX;
  const touchY = event.touches[0].clientY;
  
  const deltaX = Math.abs(touchX - touchStartX);
  const deltaY = Math.abs(touchY - touchStartY);
  
  // 如果移动距离超过10px，认为是滚动操作
  if (deltaX > 10 || deltaY > 10) {
    isScrolling = true;
  }
}

function handleNoteTouchEnd(event) {
  if (!isScrolling) {
    // 如果不是滚动操作，打开笔记详情
    const noteCard = event.currentTarget;
    const noteId = noteCard.dataset.id;
    viewNote(noteId);
  }
  
  // 重置触摸状态
  touchStartX = 0;
  touchStartY = 0;
  isScrolling = false;
}

// 查看笔记详情
async function viewNote(id) {
  try {
    const note = await getNoteById(id);
    if (!note) {
      alert('笔记不存在');
      return;
    }
    
    const modal = document.getElementById('viewModal');
    const title = modal.querySelector('.modal-title');
    const content = modal.querySelector('.modal-content');
    const category = modal.querySelector('.note-category');
    const date = modal.querySelector('.note-date');
    
    title.textContent = escapeHtml(note.title);
    content.textContent = escapeHtml(note.content);
    category.textContent = escapeHtml(note.category);
    category.className = `note-category ${getCategoryClass(note.category)}`;
    date.textContent = formatDate(note.date);
    
    modal.classList.add('show');
    
  } catch (error) {
    safeLog('查看笔记失败:', error);
    alert('查看笔记失败');
  }
}

// 编辑笔记
async function editNote(id) {
  try {
    const note = await getNoteById(id);
    if (!note) {
      alert('笔记不存在');
      return;
    }
    
    const titleInput = document.getElementById('noteTitle');
    const contentTextarea = document.getElementById('noteContent');
    const categorySelect = document.getElementById('noteCategory');
    
    titleInput.value = note.title;
    contentTextarea.value = note.content;
    categorySelect.value = note.category;
    
    editingNoteId = id;
    
    const modal = document.getElementById('noteModal');
    const modalTitle = modal.querySelector('.modal-title');
    modalTitle.textContent = '编辑笔记';
    
    modal.classList.add('show');
    
  } catch (error) {
    safeLog('编辑笔记失败:', error);
    alert('编辑笔记失败');
  }
}

// 删除笔记
async function deleteNote(id) {
  if (confirm('确定要删除这条笔记吗？')) {
    try {
      await deleteNoteFromDB(id);
      await renderNotes();
      await updateCategoryCounts();
      safeLog('笔记删除成功');
    } catch (error) {
      safeLog('删除笔记失败:', error);
      alert('删除笔记失败');
    }
  }
}

// 显示添加笔记对话框
function showAddDialog() {
  resetForm();
  const modal = document.getElementById('noteModal');
  const modalTitle = modal.querySelector('.modal-title');
  modalTitle.textContent = '添加笔记';
  modal.classList.add('show');
}

// 保存笔记
async function saveNote() {
  try {
    const titleInput = document.getElementById('noteTitle');
    const contentTextarea = document.getElementById('noteContent');
    const categorySelect = document.getElementById('noteCategory');
    
    const title = titleInput.value.trim();
    const content = contentTextarea.value.trim();
    const category = categorySelect.value;
    
    if (!title) {
      alert('请输入笔记标题');
      titleInput.focus();
      return;
    }
    
    if (!content) {
      alert('请输入笔记内容');
      contentTextarea.focus();
      return;
    }
    
    const note = {
      id: editingNoteId || generateId(),
      title,
      content,
      category,
      date: new Date().toISOString()
    };
    
    await saveNoteToDB(note);
    
    const modal = document.getElementById('noteModal');
    modal.classList.remove('show');
    
    await renderNotes();
    await updateCategoryCounts();
    
    resetForm();
    safeLog('笔记保存成功');
    
  } catch (error) {
    safeLog('保存笔记失败:', error);
    alert('保存笔记失败');
  }
}

// 重置表单
function resetForm() {
  const titleInput = document.getElementById('noteTitle');
  const contentTextarea = document.getElementById('noteContent');
  const categorySelect = document.getElementById('noteCategory');
  
  titleInput.value = '';
  contentTextarea.value = '';
  categorySelect.value = '工作';
  editingNoteId = null;
}

// 更新分类计数
async function updateCategoryCounts() {
  try {
    const notes = await getAllNotes();
    const counts = {
      '': notes.length,
      '工作': 0,
      '生活': 0,
      '学习': 0
    };
    
    notes.forEach(note => {
      if (counts.hasOwnProperty(note.category)) {
        counts[note.category]++;
      }
    });
    
    // 更新侧边栏分类计数
    document.querySelectorAll('.category-item').forEach(item => {
      const category = item.dataset.category;
      const countSpan = item.querySelector('.category-count');
      if (countSpan && counts.hasOwnProperty(category)) {
        countSpan.textContent = counts[category];
      }
    });
    
  } catch (error) {
    safeLog('更新分类计数失败:', error);
  }
}

// 处理移动端导航
function handleMobileNav(action) {
  switch (action) {
    case 'add':
      showAddDialog();
      break;
    case 'search':
      // 聚焦搜索框
      const searchInput = document.getElementById('search');
      if (searchInput) {
        searchInput.focus();
      }
      break;
    case 'filter':
      // 显示筛选面板（如果有）
      break;
    default:
      break;
  }
}

// 工具函数
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now - date);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 1) {
    return '今天';
  } else if (diffDays === 2) {
    return '昨天';
  } else if (diffDays <= 7) {
    return `${diffDays - 1}天前`;
  } else {
    return date.toLocaleDateString('zh-CN');
  }
}

function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getCategoryClass(category) {
  switch (category) {
    case '工作':
      return 'category-work';
    case '生活':
      return 'category-life';
    case '学习':
      return 'category-study';
    default:
      return 'category-other';
  }
}

// 页面滚动优化
let ticking = false;

function updateOnScroll() {
  // 在这里可以添加滚动时的优化逻辑
  ticking = false;
}

function requestTick() {
  if (!ticking) {
    requestAnimationFrame(updateOnScroll);
    ticking = true;
  }
}

// 添加滚动事件监听器
window.addEventListener('scroll', requestTick);

// 页面可见性变化处理
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    // 页面重新可见时刷新数据
    renderNotes();
  }
});

// 键盘快捷键支持
document.addEventListener('keydown', (e) => {
  // Ctrl/Cmd + N: 新建笔记
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
    e.preventDefault();
    showAddDialog();
  }
  
  // Ctrl/Cmd + F: 搜索
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault();
    const searchInput = document.getElementById('search');
    if (searchInput) {
      searchInput.focus();
    }
  }
  
  // ESC: 关闭模态框
  if (e.key === 'Escape') {
    const modals = document.querySelectorAll('.modal.show');
    modals.forEach(modal => {
      modal.classList.remove('show');
    });
    resetForm();
  }
});

// 响应式处理
window.addEventListener('resize', () => {
  const isMobile = window.innerWidth <= 768;
  const sidebar = document.getElementById('sidebar');
  const mainContent = document.getElementById('mainContent');
  
  if (isMobile) {
    // 移动端始终展开侧边栏
    sidebar.classList.remove('collapsed');
    mainContent.classList.remove('collapsed');
  }
});

// 初始化时检查屏幕尺寸
window.dispatchEvent(new Event('resize'));