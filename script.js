// IndexedDB 数据库配置
const DB_NAME = 'NotesDB';
const DB_VERSION = 1;
const STORE_NAME = 'notes';

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
  document.documentElement.style.setProperty('--theme', themeInput.value);
  localStorage.setItem('theme', themeInput.value);
});

// 加载主题
window.onload = async () => {
  const t = localStorage.getItem('theme') || '#2196F3';
  document.documentElement.style.setProperty('--theme', t);
  themeInput.value = t;
  showSection('search'); // 默认显示搜索区域
  await renderNotes();
  await renderCategories();
};

// 切换功能区域显示
function showSection(sectionName) {
  // 隐藏所有内容区域
  document.getElementById('notesList').style.display = 'none';
  document.getElementById('dateView-section').style.display = 'none';
  
  // 隐藏所有侧边栏内容
  const sections = ['search-section', 'add-section'];
  sections.forEach(id => {
    document.getElementById(id).style.display = 'none';
  });
  
  // 根据选择显示对应区域
  switch(sectionName) {
    case 'search':
      document.getElementById('search-section').style.display = 'block';
      document.getElementById('notesList').style.display = 'block';
      document.getElementById('current-section-title').textContent = '📋 笔记列表';
      break;
    case 'add':
      document.getElementById('add-section').style.display = 'block';
      document.getElementById('notesList').style.display = 'block';
      document.getElementById('current-section-title').textContent = '📋 笔记列表';
      break;
    case 'dateView':
      document.getElementById('dateView-section').style.display = 'block';
      document.getElementById('current-section-title').textContent = '📅 日期视图';
      renderDateView();
      break;
  }
}

// 按日期分组显示笔记
async function renderDateView() {
  const notes = await getAllNotes();
  const dateGroups = {};
  
  // 按日期分组
  notes.forEach(note => {
    const date = note.createDate || new Date(note.id).toLocaleDateString('zh-CN');
    if (!dateGroups[date]) {
      dateGroups[date] = [];
    }
    dateGroups[date].push(note);
  });
  
  // 渲染日期分组
  const container = document.getElementById('dateGroups');
  container.innerHTML = '';
  
  // 按日期倒序排列
  const sortedDates = Object.keys(dateGroups).sort((a, b) => 
    new Date(b) - new Date(a)
  );
  
  sortedDates.forEach(date => {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'date-group';
    
    const titleDiv = document.createElement('div');
    titleDiv.className = 'date-group-title';
    titleDiv.textContent = `${date} (${dateGroups[date].length}条笔记)`;
    
    const notesDiv = document.createElement('div');
    dateGroups[date].forEach(note => {
      const noteDiv = document.createElement('div');
      noteDiv.className = 'note-item';
      noteDiv.onclick = () => showDetail(note);
      noteDiv.innerHTML = `
        <h3>${note.title}</h3>
        <p>${note.content.substring(0, 100)}${note.content.length > 100 ? '...' : ''}</p>
        ${note.img ? `<img src="${note.img}" class="note-img" style="max-height: 80px; object-fit: cover;">` : ''}
        <small>分类：${note.category || '未分类'} | 时间：${new Date(note.createTime || note.id).toLocaleTimeString('zh-CN')}</small>
      `;
      notesDiv.appendChild(noteDiv);
    });
    
    groupDiv.appendChild(titleDiv);
    groupDiv.appendChild(notesDiv);
    container.appendChild(groupDiv);
  });
}

// 搜索功能
function searchNotes() {
  renderNotes();
}

// 渲染分类筛选
async function renderCategories() {
  const notes = await getAllNotes();
  const cats = [...new Set(notes.map(n => n.category).filter(Boolean))];
  const sel = document.getElementById('categoryFilter');
  sel.innerHTML = '<option value="">全部分类</option>';
  cats.forEach(c => {
    const op = document.createElement('option');
    op.value = c;
    op.textContent = c;
    sel.appendChild(op);
  });
}

// 保存笔记
function saveNote() {
  const title = document.getElementById('title').value.trim();
  const content = document.getElementById('content').value.trim();
  const category = document.getElementById('category').value.trim();
  if (!title || !content) {
    alert('请填写标题和内容');
    return;
  }
  const file = document.getElementById('imgUpload').files[0];
  let img = '';
  if (file) {
    const reader = new FileReader();
    reader.onload = async e => {
      img = e.target.result;
      await createNote(title, content, category, img);
    };
    reader.readAsDataURL(file);
  } else {
    createNote(title, content, category, '');
  }
}

async function createNote(title, content, category, img) {
  const note = {
    id: Date.now(),
    title,
    content,
    category,
    img,
    comments: [],
    createTime: new Date().toISOString(),
    createDate: new Date().toLocaleDateString('zh-CN')
  };
  await saveNoteToDB(note);
  document.getElementById('title').value = '';
  document.getElementById('content').value = '';
  document.getElementById('category').value = '';
  document.getElementById('imgUpload').value = '';
  await renderNotes();
  await renderCategories();
}

// 渲染列表
async function renderNotes() {
  const notes = await getAllNotes();
  const search = document.getElementById('search').value.toLowerCase();
  const catFilter = document.getElementById('categoryFilter').value;
  const list = document.getElementById('notesList');
  list.innerHTML = '';

  let filtered = notes;
  if (search) filtered = filtered.filter(n =>
    n.title.toLowerCase().includes(search) || n.content.toLowerCase().includes(search)
  );
  if (catFilter) filtered = filtered.filter(n => n.category === catFilter);

  filtered.forEach(n => {
    const div = document.createElement('div');
    div.className = 'note-item';
    div.onclick = () => showDetail(n);
    div.innerHTML = `
      <h3>${n.title}</h3>
      <p>${n.content.substring(0, 100)}${n.content.length > 100 ? '...' : ''}</p>
      ${n.img ? `<img src="${n.img}" class="note-img" style="max-height: 100px; object-fit: cover;">` : ''}
      <small>分类：${n.category || '未分类'}</small>
      <div style="margin-top: 8px;">
        <button onclick="event.stopPropagation(); delNote(${n.id})">删除</button>
      </div>
    `;
    list.appendChild(div);
  });
}

// 显示详情
function showDetail(note) {
  const modal = document.getElementById('detailModal');
  const detail = document.getElementById('noteDetail');
  detail.innerHTML = `
    <h2>${note.title}</h2>
    <p>${note.content}</p>
    ${note.img ? `<img src="${note.img}" class="note-img">` : ''}
    <small>分类：${note.category || '未分类'}</small>
    <div class="comment-box">
      <input placeholder="写评论..." onkeydown="if(event.key==='Enter')addComment(${note.id},this)">
      <div>${note.comments.map(c => `<div class="comment">• ${c}</div>`).join('')}</div>
    </div>
  `;
  modal.style.display = 'block';
}

// 关闭详情
function closeDetail() {
  document.getElementById('detailModal').style.display = 'none';
}

// 点击弹窗外部关闭
window.onclick = (event) => {
  const modal = document.getElementById('detailModal');
  if (event.target == modal) {
    modal.style.display = 'none';
  }
};

// 评论
async function addComment(id, input) {
  const c = input.value.trim();
  if (!c) return;
  const notes = await getAllNotes();
  const note = notes.find(x => x.id === id);
  if (note) {
    note.comments.push(c);
    await saveNoteToDB(note);
    showDetail(note);
    input.value = '';
  }
}

// 删除
async function delNote(id) {
  if (!confirm('确定删除？')) return;
  await deleteNoteFromDB(id);
  await renderNotes();
  await renderCategories();
}