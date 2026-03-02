// 苹果+微信兼容：IndexedDB前缀兼容、事件绑定优化
const DB_NAME = 'NotesDB';
const DB_VERSION = 1;
const STORE_NAME = 'notes';

// 全局变量
let currentCategory = '';
let editingNoteId = null;
// 苹果浏览器兼容：判断是否为微信内置浏览器
const isWeChat = /MicroMessenger/i.test(navigator.userAgent);
// 苹果浏览器兼容：判断是否为iOS设备
const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

// 初始化数据库：增加苹果/微信IndexedDB兼容处理
function initDB() {
  return new Promise((resolve, reject) => {
    // 解决iOS IndexedDB打开失败问题
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = (e) => {
      console.error('IndexedDB初始化失败:', e.target.error);
      // 微信/iOS兼容：重新尝试打开数据库
      if (isWeChat || isIOS) {
        indexedDB.deleteDatabase(DB_NAME);
        setTimeout(() => initDB().then(resolve).catch(reject), 500);
      } else {
        reject(e.target.error);
      }
    };
    
    request.onsuccess = (e) => {
      const db = e.target.result;
      // 解决iOS IndexedDB连接丢失问题
      db.onversionchange = () => {
        db.close();
        alert('数据库更新，请刷新页面重试');
      };
      resolve(db);
    };
    
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // 微信/iOS兼容：创建对象仓库时增加主键兼容
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        // 建立索引，提升查询效率（兼容iOS）
        store.createIndex('categoryIndex', 'category', { unique: false });
        store.createIndex('dateIndex', 'createDate', { unique: false });
      }
    };
  });
}

// 数据库操作函数：增加错误重试机制（适配苹果/微信）
async function getDB() {
  if (!window.notesDB) {
    window.notesDB = await initDB();
  }
  // 检查数据库连接状态（适配iOS）
  if (window.notesDB.closed) {
    window.notesDB = await initDB();
  }
  return window.notesDB;
}

async function getAllNotes() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    // 微信/iOS兼容：使用getAll替代openCursor，提升性能
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => {
      console.error('获取笔记失败:', e.target.error);
      reject(e.target.error);
    };
  });
}

async function saveNoteToDB(note) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(note);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => {
      console.error('保存笔记失败:', e.target.error);
      // 微信/iOS兼容：重试保存
      setTimeout(() => saveNoteToDB(note).then(resolve).catch(reject), 500);
    };
  });
}

async function deleteNoteFromDB(id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    
    request.onsuccess = () => resolve();
    request.onerror = (e) => {
      console.error('删除笔记失败:', e.target.error);
      reject(e.target.error);
    };
  });
}

// 主题切换：增加iOS Safari颜色选择器兼容
const themeInput = document.getElementById('themeColor');
themeInput.addEventListener('input', () => {
  const color = themeInput.value;
  document.documentElement.style.setProperty('--primary-color', color);
  document.documentElement.style.setProperty('--secondary-color', adjustBrightness(color, -20));
  // 微信/iOS兼容：使用localStorage替代sessionStorage，保证持久化
  localStorage.setItem('theme', color);
});

// 调整颜色亮度：兼容iOS颜色解析
function adjustBrightness(color, percent) {
  try {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, Math.max(0, (num >> 16) + amt));
    const G = Math.min(255, Math.max(0, (num >> 8 & 0x00FF) + amt));
    const B = Math.min(255, Math.max(0, (num & 0x0000FF) + amt));
    return `#${((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1)}`;
  } catch (e) {
    // iOS兼容：解析失败返回默认颜色
    return color;
  }
}

// 加载主题：增加iOS localStorage兼容
window.onload = async () => {
  // 微信/iOS兼容：解决页面加载延迟问题
  document.body.style.opacity = '0';
  setTimeout(() => {
    document.body.style.opacity = '1';
    document.body.style.transition = 'opacity 0.3s ease';
  }, 100);

  // 加载主题色
  const savedTheme = localStorage.getItem('theme') || '#2196F3';
  document.documentElement.style.setProperty('--primary-color', savedTheme);
  document.documentElement.style.setProperty('--secondary-color', adjustBrightness(savedTheme, -20));
  themeInput.value = savedTheme;
  
  // 初始化应用：增加错误捕获（适配微信/iOS）
  try {
    await initApp();
  } catch (error) {
    console.error('应用初始化失败:', error);
    // 微信/iOS友好提示
    alert(isWeChat ? '微信内初始化失败，建议刷新页面或复制链接到Safari打开' : '初始化失败，请刷新页面重试');
  }
};

// 初始化应用：简化初始化流程，提升微信/iOS加载速度
async function initApp() {
  await renderNotes();
  await updateCategoryCounts();
  bindEvents();
  initializeCategoryFilter();
  // 微信/iOS兼容：自动展开侧边栏（移动端）
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar').classList.add('show');
  }
  console.log('应用初始化成功（兼容模式：微信=' + isWeChat + ', iOS=' + isIOS + '）');
}

// 初始化分类筛选下拉框：保持原有功能
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

// 绑定事件：增加iOS触摸事件、微信点击事件兼容
function bindEvents() {
  // 侧边栏切换：兼容iOS/微信触摸操作
  document.querySelector('.sidebar-toggle').addEventListener('click', toggleSidebar);
  document.querySelector('.sidebar-toggle').addEventListener('touchstart', (e) => {
    e.preventDefault();
    toggleSidebar();
  }, { passive: false });
  
  // 搜索功能：增加输入防抖（适配iOS输入法）
  const mainSearch = document.getElementById('search');
  const sidebarSearch = document.getElementById('sidebarSearch');
  let searchTimer = null;
  const searchHandler = debounce(async () => {
    if (mainSearch && sidebarSearch) {
      mainSearch.value = sidebarSearch.value = mainSearch.value || sidebarSearch.value;
    }
    await renderNotes();
  }, 300);
  mainSearch.addEventListener('input', searchHandler);
  sidebarSearch.addEventListener('input', searchHandler);
  // iOS兼容：解决输入法收起后搜索不生效
  mainSearch.addEventListener('blur', searchHandler);
  sidebarSearch.addEventListener('blur', searchHandler);
  
  // 日期筛选：兼容iOS日期选择器
  const mainDateFilter = document.getElementById('dateFilter');
  const sidebarDateFilter = document.getElementById('sidebarDateFilter');
  mainDateFilter.addEventListener('change', handleDateFilter);
  sidebarDateFilter.addEventListener('change', handleDateFilter);
  // iOS兼容：解决日期选择器点击无响应
  mainDateFilter.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  sidebarDateFilter.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  
  // 分类筛选：保持原有功能
  document.getElementById('categoryFilter').addEventListener('change', handleCategoryFilter);
  
  // 分类点击事件：增加iOS触摸点击兼容
  document.querySelectorAll('.category-item').forEach(item => {
    if (!item.classList.contains('add-category')) {
      item.addEventListener('click', () => {
        const category = item.dataset.category;
        selectCategory(category);
      });
      // iOS触摸事件兼容
      item.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const category = item.dataset.category;
        selectCategory(category);
      }, { passive: false });
    }
  });

  // 悬浮按钮：解决iOS触摸点击穿透
  document.querySelector('.floating-add-btn').addEventListener('touchstart', (e) => {
    e.preventDefault();
    showAddDialog();
  }, { passive: false });

  // 弹窗关闭按钮：兼容iOS触摸操作
  document.querySelectorAll('.close').forEach(btn => {
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      btn.click();
    }, { passive: false });
  });

  // 按钮点击：解决iOS触摸点击无响应
  document.querySelectorAll('.btn-cancel, .btn-save').forEach(btn => {
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      btn.click();
    }, { passive: false });
  });
}

// 防抖函数：解决iOS输入框频繁触发事件
function debounce(fn, delay) {
  let timer = null;
  return function() {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, arguments), delay);
  };
}

// 侧边栏切换：兼容iOS/微信布局
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const mainContent = document.getElementById('mainContent');
  const isMobile = window.innerWidth <= 768;
  
  if (isMobile) {
    sidebar.classList.toggle('show');
  } else {
    sidebar.classList.toggle('collapsed');
    mainContent.classList.toggle('collapsed');
  }
}

// 选择分类：保持原有功能
async function selectCategory(category) {
  currentCategory = category;
  
  document.querySelectorAll('.category-item').forEach(item => {
    item.classList.remove('active');
    if (item.dataset.category === category) {
      item.classList.add('active');
    }
  });
  
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

// 处理日期筛选：保持原有功能，增加iOS日期格式兼容
async function handleDateFilter() {
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

// 处理分类筛选：保持原有功能
async function handleCategoryFilter() {
  const filterCategory = document.getElementById('categoryFilter').value;
  if (filterCategory) {
    await selectCategory(filterCategory);
  }
}

// 渲染笔记：优化iOS/微信渲染性能，减少DOM操作
async function renderNotes() {
  try {
    const notes = await getAllNotes();
    const searchTerm = document.getElementById('search').value.toLowerCase();
    const dateFilter = document.getElementById('dateFilter').value;
    const categoryFilter = document.getElementById('categoryFilter').value;
    
    // 应用筛选：简化逻辑，提升iOS/微信处理速度
    let filteredNotes = notes.filter(note => {
      const matchesSearch = !searchTerm || 
        note.title.toLowerCase().includes(searchTerm) || 
        note.content.toLowerCase().includes(searchTerm);
      
      const matchesDate = !dateFilter || 
        note.createDate === dateFilter || 
        (note.createTime && new Date(note.createTime).toISOString().split('T')[0] === dateFilter);
      
      const matchesCategory = !currentCategory || note.category === currentCategory;
      const matchesFilterCategory = !categoryFilter || note.category === categoryFilter;
      
      return matchesSearch && matchesDate && matchesCategory && matchesFilterCategory;
    });
    
    // 排序：简化日期处理，兼容iOS日期解析
    filteredNotes.sort((a, b) => {
      const dateA = a.createTime ? new Date(a.createTime) : new Date(a.id);
      const dateB = b.createTime ? new Date(b.createTime) : new Date(b.id);
      return dateB - dateA;
    });
    
    // 渲染笔记：使用文档片段，减少iOS/微信重排重绘
    const container = document.getElementById('notesList');
    const fragment = document.createDocumentFragment();
    container.innerHTML = '';
    
    if (filteredNotes.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'empty-state';
      emptyDiv.innerHTML = '<p>暂无笔记，点击右下角"+"按钮添加</p>';
      fragment.appendChild(emptyDiv);
    } else {
      filteredNotes.forEach(note => {
        const card = createNoteCard(note);
        fragment.appendChild(card);
      });
    }
    
    container.appendChild(fragment);
  } catch (error) {
    console.error('渲染笔记失败:', error);
    alert('加载笔记失败，请刷新页面');
  }
}

// 创建笔记卡片：增加iOS触摸反馈，解决微信点击穿透
function createNoteCard(note) {
  const card = document.createElement('div');
  card.className = 'note-card';
  
  const date = note.createDate || new Date(note.id).toLocaleDateString('zh-CN');
  const time = note.createTime ? new Date(note.createTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
  
  card.innerHTML = `
    <div class="note-header">
      <h3 class="note-title">${escapeHtml(note.title)}</h3>
      <span class="note-category-badge">${escapeHtml(note.category || '未分类')}</span>
    </div>
    <div class="note-content">${escapeHtml(note.content)}</div>
    ${note.img ? `<img src="${note.img}" class="note-image" alt="笔记图片" loading="lazy">` : ''}
    <div class="note-footer">
      <div class="note-date">
        <span>📅 ${date}</span>
        ${time ? `<span>⏰ ${time}</span>` : ''}
      </div>
      <div class="note-actions">
        <button class="note-action-btn" data-id="${note.id}" title="编辑">✏️</button>
        <button class="note-action-btn" data-id="${note.id}" title="删除">🗑️</button>
      </div>
    </div>
  `;
  
  // 点击卡片查看详情：兼容iOS触摸操作，解决微信点击穿透
  card.addEventListener('click', (e) => {
    if (!e.target.closest('.note-actions')) {
      showNoteDetail(note);
    }
  });
  card.addEventListener('touchstart', (e) => {
    if (!e.target.closest('.note-actions')) {
      e.preventDefault();
      showNoteDetail(note);
    }
  }, { passive: false });
  
  // 编辑/删除按钮：使用事件委托，提升iOS/微信性能
  card.querySelector('.note-actions').addEventListener('click', (e) => {
    const id = parseInt(e.target.dataset.id);
    if (e.target.title === '编辑') {
      editNote(id);
    } else if (e.target.title === '删除') {
      deleteNote(id);
    }
  });
  // iOS触摸事件兼容
  card.querySelector('.note-actions').addEventListener('touchstart', (e) => {
    e.preventDefault();
    const id = parseInt(e.target.dataset.id);
    if (e.target.title === '编辑') {
      editNote(id);
    } else if (e.target.title === '删除') {
      deleteNote(id);
    }
  }, { passive: false });
  
  return card;
}

// 显示笔记详情：保持原有功能，增加iOS图片加载兼容
function showNoteDetail(note) {
  const modal = document.getElementById('detailModal');
  const title = document.getElementById('detail-title');
  const content = document.getElementById('noteDetail');
  
  title.textContent = note.title;
  
  const date = note.createDate || new Date(note.id).toLocaleDateString('zh-CN');
  const time = note.createTime ? new Date(note.createTime).toLocaleTimeString('zh-CN') : '';
  
  content.innerHTML = `
    <div class="detail-content">
      <p class="detail-meta">
        <span class="detail-category">分类：${note.category || '未分类'}</span>
        <span class="detail-date">日期：${date}</span>
        ${time ? `<span class="detail-time">时间：${time}</span>` : ''}
      </p>
      <div class="detail-text">${escapeHtml(note.content).replace(/\n/g, '<br>')}</div>
      ${note.img ? `<img src="${note.img}" class="detail-image" alt="笔记图片" loading="lazy">` : ''}
      ${note.comments && note.comments.length > 0 ? `
        <div class="detail-comments">
          <h4>评论 (${note.comments.length})</h4>
          ${note.comments.map(comment => `<div class="comment">${escapeHtml(comment)}</div>`).join('')}
        </div>
      ` : ''}
    </div>
  `;
  
  modal.classList.add('show');
  // iOS兼容：解决弹窗内滚动不生效
  modal.querySelector('.modal-content').style.overflowY = 'auto';
  modal.querySelector('.modal-content').style.webkitOverflowScrolling = 'touch';
}

// 关闭弹窗：增加iOS/微信兼容，解决弹窗关闭后页面滚动问题
function closeAddDialog() {
  document.getElementById('addModal').classList.remove('show');
  editingNoteId = null;
  // iOS兼容：恢复页面滚动
  document.body.style.overflow = 'auto';
}

function closeDetailDialog() {
  document.getElementById('detailModal').classList.remove('show');
  // iOS兼容：恢复页面滚动
  document.body.style.overflow = 'auto';
}

// 保存笔记：增加iOS文件上传兼容，解决微信图片上传失败
async function saveNote() {
  const title = document.getElementById('title').value.trim();
  const content = document.getElementById('content').value.trim();
  const category = document.getElementById('noteCategory').value;
  const file = document.getElementById('imgUpload').files[0];
  
  if (!title) {
    alert('请填写笔记标题');
    return;
  }
  
  if (!content) {
    alert('请填写笔记内容');
    return;
  }
  
  let img = '';
  let existingNote = null;
  
  if (editingNoteId) {
    const notes = await getAllNotes();
    existingNote = notes.find(n => n.id === editingNoteId);
    if (existingNote) {
      img = existingNote.img || '';
    }
  }
  
  // iOS/微信兼容：处理图片上传，限制文件大小（避免微信崩溃）
  if (file) {
    try {
      // 限制文件大小为5MB（微信/iOS兼容）
      if (file.size > 5 * 1024 * 1024) {
        alert('图片大小不能超过5MB，请选择更小的图片');
        return;
      }
      // iOS兼容：使用FileReader同步读取（避免异步失败）
      img = await readFileAsDataURL(file);
    } catch (error) {
      console.error('读取图片文件失败:', error);
      alert(isWeChat ? '微信内图片上传失败，建议复制链接到Safari打开上传' : '图片文件读取失败，请重试');
      return;
    }
  }
  
  const noteData = {
    title,
    content,
    category,
    img,
    comments: existingNote ? existingNote.comments : [],
    createTime: existingNote ? existingNote.createTime : new Date().toISOString(),
    createDate: existingNote ? existingNote.createDate : new Date().toLocaleDateString('zh-CN')
  };
  
  if (editingNoteId) {
    noteData.id = editingNoteId;
  } else {
    noteData.id = Date.now();
  }
  
  try {
    await saveNoteToDB(noteData);
    closeAddDialog();
    await renderNotes();
    await updateCategoryCounts();
  } catch (error) {
    console.error('保存笔记失败:', error);
    alert('保存失败，请重试');
  }
}

// 读取文件：增加iOS/微信兼容，解决文件读取失败
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (e) => {
      console.error('文件读取错误:', e.target.error);
      reject(e.target.error);
    };
    // iOS兼容：使用readAsDataURL（避免readAsBinaryString失败）
    reader.readAsDataURL(file);
  });
}

// 编辑笔记：保持原有功能
function editNote(noteId) {
  showAddDialog(noteId);
  // iOS兼容：弹窗内禁止页面滚动
  document.body.style.overflow = 'hidden';
}

// 删除笔记：保持原有功能
async function deleteNote(noteId) {
  if (confirm('确定要删除这条笔记吗？')) {
    await deleteNoteFromDB(noteId);
    await renderNotes();
    await updateCategoryCounts();
  }
}

// 更新分类计数：保持原有功能
async function updateCategoryCounts() {
  const notes = await getAllNotes();
  
  const counts = {
    total: notes.length,
    work: notes.filter(n => n.category === '工作').length,
    life: notes.filter(n => n.category === '生活').length,
    study: notes.filter(n => n.category === '学习').length
  };
  
  document.getElementById('total-count').textContent = counts.total;
  document.getElementById('work-count').textContent = counts.work;
  document.getElementById('life-count').textContent = counts.life;
  document.getElementById('study-count').textContent = counts.study;
}

// HTML转义：保持原有功能，防止XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 点击模态框外部关闭：兼容iOS/微信触摸操作
window.onclick = (event) => {
  const modals = document.querySelectorAll('.modal');
  modals.forEach(modal => {
    if (event.target === modal) {
      modal.classList.remove('show');
      // iOS兼容：恢复页面滚动
      document