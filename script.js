// 主题切换
const themeInput = document.getElementById('themeColor');
themeInput.addEventListener('input', () => {
  document.documentElement.style.setProperty('--theme', themeInput.value);
  localStorage.setItem('theme', themeInput.value);
});

// 加载主题
window.onload = () => {
  const t = localStorage.getItem('theme') || '#2196F3';
  document.documentElement.style.setProperty('--theme', t);
  themeInput.value = t;
  renderNotes();
  renderCategories();
};

// 数据结构
function getNotes() {
  return JSON.parse(localStorage.getItem('notes')) || [];
}
function setNotes(arr) {
  localStorage.setItem('notes', JSON.stringify(arr));
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
    reader.onload = e => {
      img = e.target.result;
      createNote(title, content, category, img);
    };
    reader.readAsDataURL(file);
  } else {
    createNote(title, content, category, '');
  }
}

function createNote(title, content, category, img) {
  const notes = getNotes();
  notes.unshift({
    id: Date.now(),
    title,
    content,
    category,
    img,
    comments: []
  });
  setNotes(notes);
  document.getElementById('title').value = '';
  document.getElementById('content').value = '';
  document.getElementById('category').value = '';
  document.getElementById('imgUpload').value = '';
  renderNotes();
  renderCategories();
}

// 渲染分类筛选
function renderCategories() {
  const notes = getNotes();
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

// 渲染列表
function renderNotes() {
  const notes = getNotes();
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
    div.innerHTML = `
      <h3>${n.title}</h3>
      <p>${n.content}</p>
      ${n.img ? `<img src="${n.img}" class="note-img">` : ''}
      <small>分类：${n.category || '未分类'}</small>
      <div class="comment-box">
        <input placeholder="写评论..." onkeydown="if(event.key==='Enter')addComment(${n.id},this)">
        <div>${n.comments.map(c => `<div class="comment">• ${c}</div>`).join('')}</div>
      </div>
      <button onclick="delNote(${n.id})">删除</button>
    `;
    list.appendChild(div);
  });
}

// 评论
function addComment(id, input) {
  const c = input.value.trim();
  if (!c) return;
  const notes = getNotes();
  const idx = notes.findIndex(x => x.id === id);
  if (idx >= 0) {
    notes[idx].comments.push(c);
    setNotes(notes);
    renderNotes();
    input.value = '';
  }
}

// 删除
function delNote(id) {
  if (!confirm('确定删除？')) return;
  let notes = getNotes();
  notes = notes.filter(x => x.id !== id);
  setNotes(notes);
  renderNotes();
  renderCategories();
}

// 搜索监听
document.getElementById('search').addEventListener('input', renderNotes);
document.getElementById('categoryFilter').addEventListener('change', renderNotes);