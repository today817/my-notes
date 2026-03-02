// IndexedDB 数据库配置
const DB_NAME = 'NotesDB';
const DB_VERSION = 1;
const STORE_NAME = 'notes';

// 全局变量
let currentCategory = '';
let editingNoteId = null;

// 初始化数据库
function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

// 数据库操作函数
async function getDB() {
  if (!window.notesDB) {
    window.notesDB = await initDB();
  }
  return window.notesDB;
}

async function getAllNotes() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveNoteToDB(note) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(note);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteNoteFromDB(id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
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
    await renderNotes();
    await updateCategoryCounts();
    bindEvents();
    initializeCategoryFilter();
    console.log('应用初始化成功');
  } catch (error) {
    console.error('应用初始化失败:', error);
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
  // 侧边栏切换
  document.querySelector('.sidebar-toggle').addEventListener('click', toggleSidebar);
  
  // 搜索功能
  document.getElementById('search').addEventListener('input', handleSearch);
  document.getElementById('dateFilter').addEventListener('change', handleDateFilter);
  document.getElementById('categoryFilter').addEventListener('change', handleCategoryFilter);
  
  // 分类点击事件
  document.querySelectorAll('.category-item').forEach(item => {
    if (!item.classList.contains('add-category')) {
      item.addEventListener('click', () => {
        const category = item.dataset.category;
        selectCategory(category);
      });
    }
  });
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
  await renderNotes();
}

// 处理日期筛选
async function handleDateFilter() {
  await renderNotes();
}

// 处理分类筛选
async function handleCategoryFilter() {
  const filterCategory = document.getElementById('categoryFilter').value;
  if (filterCategory) {
    await selectCategory(filterCategory);
  }
}

// 渲染笔记
async function renderNotes() {
  const notes = await getAllNotes();
  const searchTerm = document.getElementById('search').value.toLowerCase();
  const dateFilter = document.getElementById('dateFilter').value;
  const categoryFilter = document.getElementById('categoryFilter').value;
  
  // 应用筛选
  let filteredNotes = notes.filter(note => {
    // 搜索筛选
    const matchesSearch = !searchTerm || 
      note.title.toLowerCase().includes(searchTerm) || 
      note.content.toLowerCase().includes(searchTerm);
    
    // 日期筛选
    const matchesDate = !dateFilter || 
      note.createDate === dateFilter || 
      new Date(note.createTime).toISOString().split('T')[0] === dateFilter;
    
    // 分类筛选
    const matchesCategory = !currentCategory || note.category === currentCategory;
    const matchesFilterCategory = !categoryFilter || note.category === categoryFilter;
    
<<<<<<< HEAD
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
    
<<<<<<< HEAD
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'note-actions';
    
    const editBtn = document.createElement('button');
    editBtn.className = 'note-action-btn';
    editBtn.title = '编辑';
    editBtn.textContent = '✏️';
    editBtn.onclick = () => editNote(note.id);
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'note-action-btn';
    deleteBtn.title = '删除';
    deleteBtn.textContent = '🗑️';
    deleteBtn.onclick = () => deleteNote(note.id);
    
    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(deleteBtn);
    
    footerDiv.appendChild(dateDiv);
    footerDiv.appendChild(actionsDiv);
    
    card.appendChild(headerDiv);
    card.appendChild(contentDiv);
    
    // 处理图片
    if (note.img) {
      try {
        const img = document.createElement('img');
        img.src = note.img;
        img.className = 'note-image';
        img.alt = '笔记图片';
        img.onerror = () => {
          safeLog('图片加载失败:', note.img);
          img.style.display = 'none';
        };
        card.appendChild(img);
      } catch (imgError) {
        safeLog('创建图片元素失败:', imgError);
      }
    }
    
    card.appendChild(footerDiv);
    
    // 更可靠的触摸事件处理方案
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let hasMoved = false;
    let clickPrevented = false;
    
    // 处理触摸开始
    const handleTouchStart = (e) => {
      // 如果点击的是操作按钮，不处理
      if (e.target.closest('.note-actions')) return;
      
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchStartTime = Date.now();
      hasMoved = false;
      clickPrevented = false;
      
      // 重置状态
      card.dataset.touchHandled = 'false';
    };
    
    // 处理触摸移动
    const handleTouchMove = (e) => {
      // 如果点击的是操作按钮，不处理
      if (e.target.closest('.note-actions')) return;
      
      const touch = e.touches[0];
      const deltaX = Math.abs(touch.clientX - touchStartX);
      const deltaY = Math.abs(touch.clientY - touchStartY);
      
      // 如果移动距离超过5px，认为是滚动操作
      if (deltaX > 5 || deltaY > 5) {
        hasMoved = true;
        
        // 标记这个触摸事件已经被处理为滚动
        card.dataset.touchHandled = 'true';
        
        // 如果这是第一次检测到移动，阻止后续的点击事件
        if (!clickPrevented) {
          clickPrevented = true;
          
          // 立即阻止默认行为，防止滚动时触发点击
          e.preventDefault();
        }
      }
    };
    
    // 处理触摸结束
    const handleTouchEnd = (e) => {
      // 如果点击的是操作按钮，不处理
      if (e.target.closest('.note-actions')) return;
      
      const touchEndTime = Date.now();
      const touchDuration = touchEndTime - touchStartTime;
      
      // 只有当没有移动且触摸时间较短时，才认为是点击
      if (!hasMoved && touchDuration < 300) {
        // 这是一个有效的点击
        e.preventDefault();
        showNoteDetail(note);
      }
    };
    
    // 处理点击事件
    const handleCardClick = (e) => {
      // 如果点击的是操作按钮，不处理
      if (e.target.closest('.note-actions')) return;
      
      // 检查这个点击是否已经被触摸事件处理过
      // 或者是否是由触摸滚动触发的虚假点击
      if (card.dataset.touchHandled === 'true') {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      
      // 正常的点击事件
      showNoteDetail(note);
    };
    
    // 阻止触摸事件冒泡到父元素
    const handleTouchStopPropagation = (e) => {
      if (!e.target.closest('.note-actions')) {
        e.stopPropagation();
      }
    };
    
    // 清除所有现有的事件监听器，避免重复绑定
    card.replaceWith(card.cloneNode(true));
    card = card.previousSibling || card;
    
    // 重新获取编辑和删除按钮的引用
    const newEditBtn = card.querySelector('.note-action-btn[title="编辑"]');
    const newDeleteBtn = card.querySelector('.note-action-btn[title="删除"]');
    
    if (newEditBtn) {
      newEditBtn.onclick = () => editNote(note.id);
    }
    
    if (newDeleteBtn) {
      newDeleteBtn.onclick = () => deleteNote(note.id);
    }
    
    // 添加新的事件监听器
    card.addEventListener('touchstart', handleTouchStart, { passive: false });
    card.addEventListener('touchmove', handleTouchMove, { passive: false });
    card.addEventListener('touchend', handleTouchEnd, { passive: false });
    card.addEventListener('touchcancel', () => {
      hasMoved = false;
      clickPrevented = false;
    }, { passive: true });
    card.addEventListener('click', handleCardClick, { passive: false });
    
    // 为编辑和删除按钮添加事件监听器
    if (newEditBtn) {
      newEditBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        editNote(note.id);
      }, { passive: false });
    }
    
    if (newDeleteBtn) {
      newDeleteBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        deleteNote(note.id);
      }, { passive: false });
    }
    
    // 编辑和删除按钮的事件处理已在上方实现
    
    return card;
=======
    container.appendChild(fragment);
>>>>>>> parent of 7e94484 (优化浏览器兼容性)
  } catch (error) {
    console.error('渲染笔记失败:', error);
    alert('加载笔记失败，请刷新页面');
=======
    return matchesSearch && matchesDate && matchesCategory && matchesFilterCategory;
  });
  
  // 按时间倒序排列
  filteredNotes.sort((a, b) => new Date(b.createTime || b.id) - new Date(a.createTime || a.id));
  
  // 渲染笔记卡片
  const container = document.getElementById('notesList');
  container.innerHTML = '';
  
  if (filteredNotes.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>暂无笔记，点击右下角"+"按钮添加</p>
      </div>
    `;
    return;
>>>>>>> parent of 0261eef (优化苹果兼容性)
  }
  
  filteredNotes.forEach(note => {
    const card = createNoteCard(note);
    container.appendChild(card);
  });
}

// 创建笔记卡片
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
    ${note.img ? `<img src="${note.img}" class="note-image" alt="笔记图片">` : ''}
    <div class="note-footer">
      <div class="note-date">
        <span>📅 ${date}</span>
        ${time ? `<span>⏰ ${time}</span>` : ''}
      </div>
      <div class="note-actions">
        <button class="note-action-btn" onclick="editNote(${note.id})" title="编辑">✏️</button>
        <button class="note-action-btn" onclick="deleteNote(${note.id})" title="删除">🗑️</button>
      </div>
    </div>
  `;
  
  // 点击卡片查看详情
  card.addEventListener('click', (e) => {
    if (!e.target.closest('.note-actions')) {
      showNoteDetail(note);
    }
  });
  
  return card;
}

// 显示笔记详情
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
      ${note.img ? `<img src="${note.img}" class="detail-image" alt="笔记图片">` : ''}
      ${note.comments && note.comments.length > 0 ? `
        <div class="detail-comments">
          <h4>评论 (${note.comments.length})</h4>
          ${note.comments.map(comment => `<div class="comment">${escapeHtml(comment)}</div>`).join('')}
        </div>
      ` : ''}
    </div>
  `;
  
  modal.classList.add('show');
}

// 关闭详情对话框
function closeDetailDialog() {
  document.getElementById('detailModal').classList.remove('show');
}

// 显示新增对话框
function showAddDialog(noteId = null) {
  const modal = document.getElementById('addModal');
  const title = document.getElementById('modal-title');
  const formTitle = document.getElementById('title');
  const formContent = document.getElementById('content');
  const formCategory = document.getElementById('noteCategory');
  const formFile = document.getElementById('imgUpload');
  
  editingNoteId = noteId;
  
  // 重置表单
  formTitle.value = '';
  formContent.value = '';
  formCategory.value = currentCategory || '工作';
  formFile.value = '';
  
  if (noteId) {
    title.textContent = '编辑笔记';
    // 加载笔记数据
    loadNoteForEdit(noteId);
  } else {
    title.textContent = '新增笔记';
  }
  
  modal.classList.add('show');
}

// 加载笔记进行编辑
async function loadNoteForEdit(noteId) {
  const notes = await getAllNotes();
  const note = notes.find(n => n.id === noteId);
  
  if (note) {
    document.getElementById('title').value = note.title;
    document.getElementById('content').value = note.content;
    document.getElementById('noteCategory').value = note.category || '工作';
  }
}

// 关闭新增对话框
function closeAddDialog() {
  document.getElementById('addModal').classList.remove('show');
  editingNoteId = null;
}

// 关闭详情对话框
function closeDetailDialog() {
  document.getElementById('detailModal').classList.remove('show');
}

// 保存笔记
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
  
  // 如果是编辑模式，先获取现有笔记数据
  if (editingNoteId) {
    const notes = await getAllNotes();
    existingNote = notes.find(n => n.id === editingNoteId);
    if (existingNote) {
      img = existingNote.img || '';
    }
  }
  
  // 如果有新文件，读取新图片
  if (file) {
    try {
      img = await readFileAsDataURL(file);
    } catch (error) {
      console.error('读取图片文件失败:', error);
      alert('图片文件读取失败，请重试');
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

// 读取文件为DataURL
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 编辑笔记
function editNote(noteId) {
  showAddDialog(noteId);
}

// 删除笔记
async function deleteNote(noteId) {
  if (confirm('确定要删除这条笔记吗？')) {
    await deleteNoteFromDB(noteId);
    await renderNotes();
    await updateCategoryCounts();
  }
}

// 更新分类计数
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

// HTML转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 点击模态框外部关闭
window.onclick = (event) => {
  const modals = document.querySelectorAll('.modal');
  modals.forEach(modal => {
    if (event.target === modal) {
      modal.classList.remove('show');
    }
  });
};

// 按ESC键关闭模态框
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    const modals = document.querySelectorAll('.modal.show');
    modals.forEach(modal => {
      modal.classList.remove('show');
    });
  }
});