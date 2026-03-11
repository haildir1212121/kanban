// Fleet Repair Tracking System
// Firebase Firestore backend with real-time sync

const firebaseConfig = {
  apiKey: "AIzaSyCnH_ILuDyJB1mC0iBlrfYIAFVumD74yo4",
  authDomain: "dlx-dmt-tracker.firebaseapp.com",
  projectId: "dlx-dmt-tracker",
  storageBucket: "dlx-dmt-tracker.firebasestorage.app",
  messagingSenderId: "958627003202",
  appId: "1:958627003202:web:07ea8476831ef49e4ea6db",
  measurementId: "G-3XSEV0RBX0"
};

const COLLECTION = 'tickets';

const COLUMNS = [
  { id: 'incoming', title: 'Incoming', colorClass: 'col-incoming' },
  { id: 'diagnosing', title: 'Diagnosing', colorClass: 'col-diagnosing' },
  { id: 'waiting-parts', title: 'Waiting for Parts', colorClass: 'col-waiting-parts' },
  { id: 'in-repair', title: 'In Repair', colorClass: 'col-in-repair' },
  { id: 'completed', title: 'Completed', colorClass: 'col-completed' },
];

const REPAIR_TYPE_LABELS = {
  'engine': 'Engine',
  'transmission': 'Transmission',
  'brakes': 'Brakes',
  'electrical': 'Electrical',
  'hvac': 'HVAC',
  'tires': 'Tires/Wheels',
  'suspension': 'Suspension',
  'body': 'Body/Paint',
  'oil-change': 'Oil Change/PM',
  'inspection': 'Inspection',
  'other': 'Other',
};

let db = null;
let tickets = [];
let draggedTicketId = null;
let draggedElement = null;

// ── Firebase ─────────────────────────────────

function initFirebase() {
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
}

function subscribeToTickets() {
  db.collection(COLLECTION)
    .orderBy('createdAt', 'desc')
    .onSnapshot((snapshot) => {
      tickets = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      renderBoard();
    }, (error) => {
      console.error('Firestore subscription error:', error);
    });
}

async function saveTicket(ticket) {
  const { id, ...data } = ticket;
  if (id && await docExists(id)) {
    await db.collection(COLLECTION).doc(id).update(data);
  } else {
    const ref = await db.collection(COLLECTION).add(data);
    return ref.id;
  }
  return id;
}

async function deleteTicket(id) {
  await db.collection(COLLECTION).doc(id).delete();
}

async function updateTicketColumn(id, column, extras = {}) {
  await db.collection(COLLECTION).doc(id).update({ column, ...extras });
}

async function docExists(id) {
  const doc = await db.collection(COLLECTION).doc(id).get();
  return doc.exists;
}

// ── Rendering ────────────────────────────────

function renderBoard() {
  const board = document.getElementById('board');
  board.style.setProperty('--column-count', COLUMNS.length);
  board.innerHTML = '';

  COLUMNS.forEach(col => {
    const colTickets = tickets.filter(t => t.column === col.id);

    const colEl = document.createElement('div');
    colEl.className = 'fleet-column';
    colEl.dataset.column = col.id;

    colEl.innerHTML = `
      <div class="fleet-column__header">
        <div class="fleet-column__color ${col.colorClass}"></div>
        <span class="fleet-column__title">${col.title}</span>
        <span class="fleet-column__count">${colTickets.length}</span>
      </div>
      <div class="fleet-column__cards" data-column="${col.id}">
        ${colTickets.length === 0 ? '<div class="fleet-column__empty">No tickets</div>' : ''}
      </div>
    `;

    const cardsContainer = colEl.querySelector('.fleet-column__cards');

    colTickets
      .sort((a, b) => {
        const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
        return (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3);
      })
      .forEach(ticket => {
        cardsContainer.appendChild(createTicketCard(ticket));
      });

    setupDropZone(cardsContainer);
    board.appendChild(colEl);
  });

  updateStats();
}

function createTicketCard(ticket) {
  const card = document.createElement('div');
  card.className = 'ticket-card';
  card.dataset.id = ticket.id;
  card.dataset.priority = ticket.priority || 'medium';
  card.draggable = true;

  const priority = ticket.priority || 'medium';
  const priorityLabel = priority.charAt(0).toUpperCase() + priority.slice(1);
  const repairLabel = REPAIR_TYPE_LABELS[ticket.repairType] || ticket.repairType || 'Other';
  const timeAgo = getTimeAgo(ticket.createdAt);

  card.innerHTML = `
    <div class="ticket-card__header">
      <div class="ticket-card__vehicle-number">#${escapeHtml(ticket.vehicleNumber || '')}</div>
      <button class="ticket-card__edit" title="Edit ticket">
        <svg width="16" height="16" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M227.31 73.37l-44.68-44.69a16 16 0 00-22.63 0L36.69 152A15.86 15.86 0 0032 163.31V208a16 16 0 0016 16h44.69a15.86 15.86 0 0011.31-4.69L227.31 96a16 16 0 000-22.63zM192 108.68L147.31 64 168 43.31 212.69 88z" fill="currentColor"/>
        </svg>
      </button>
    </div>
    ${ticket.vehicleName ? `<div class="ticket-card__vehicle-name">${escapeHtml(ticket.vehicleName)}</div>` : ''}
    <div class="ticket-card__body">
      ${ticket.description ? `<div class="ticket-card__description">${escapeHtml(ticket.description)}</div>` : ''}
      <div class="ticket-card__meta">
        <span class="ticket-card__badge badge--repair-type">${repairLabel}</span>
        <span class="ticket-card__badge badge--priority-${priority}">${priorityLabel}</span>
      </div>
    </div>
    <div class="ticket-card__footer">
      <span class="ticket-card__assignee">${ticket.assignee ? escapeHtml(ticket.assignee) : 'Unassigned'}</span>
      <span class="ticket-card__time">${ticket.estimatedHours ? ticket.estimatedHours + 'h est' : ''}${ticket.mileage ? ' · ' + escapeHtml(ticket.mileage) + ' mi' : ''}</span>
    </div>
    <div class="ticket-card__ticket-id">${ticket.id.substring(0, 8)} · ${timeAgo}</div>
  `;

  card.querySelector('.ticket-card__edit').addEventListener('click', (e) => {
    e.stopPropagation();
    openEditModal(ticket.id);
  });

  card.addEventListener('dragstart', (e) => {
    draggedTicketId = ticket.id;
    draggedElement = card;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ticket.id);
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    draggedTicketId = null;
    draggedElement = null;
    document.querySelectorAll('.drop-placeholder').forEach(p => p.remove());
    document.querySelectorAll('.fleet-column.drag-over').forEach(c => c.classList.remove('drag-over'));
  });

  return card;
}

// ── Drag and Drop ────────────────────────────

function setupDropZone(container) {
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const column = container.closest('.fleet-column');
    column.classList.add('drag-over');

    const afterElement = getDragAfterElement(container, e.clientY);
    let placeholder = container.querySelector('.drop-placeholder');

    if (!placeholder) {
      placeholder = document.createElement('div');
      placeholder.className = 'drop-placeholder';
    }

    if (afterElement) {
      container.insertBefore(placeholder, afterElement);
    } else {
      container.appendChild(placeholder);
    }

    const emptyEl = container.querySelector('.fleet-column__empty');
    if (emptyEl) emptyEl.remove();
  });

  container.addEventListener('dragleave', (e) => {
    if (!container.contains(e.relatedTarget)) {
      const column = container.closest('.fleet-column');
      column.classList.remove('drag-over');
      const placeholder = container.querySelector('.drop-placeholder');
      if (placeholder) placeholder.remove();
    }
  });

  container.addEventListener('drop', (e) => {
    e.preventDefault();
    const ticketId = e.dataTransfer.getData('text/plain');
    const newColumn = container.dataset.column;

    const column = container.closest('.fleet-column');
    column.classList.remove('drag-over');

    const placeholder = container.querySelector('.drop-placeholder');
    if (placeholder) placeholder.remove();

    if (!ticketId || !newColumn) return;

    const ticket = tickets.find(t => t.id === ticketId);
    if (!ticket) return;

    const oldColumn = ticket.column;
    const extras = {};

    if (newColumn === 'completed' && oldColumn !== 'completed') {
      extras.completedAt = new Date().toISOString();
    }

    updateTicketColumn(ticketId, newColumn, extras).catch(err => {
      console.error('Failed to update ticket column:', err);
    });
  });
}

function getDragAfterElement(container, y) {
  const cards = [...container.querySelectorAll('.ticket-card:not(.dragging)')];
  return cards.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset, element: child };
    }
    return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// ── Modal / Ticketing ────────────────────────

function openModal(ticket = null) {
  const overlay = document.getElementById('modal-overlay');
  const form = document.getElementById('ticket-form');
  const title = document.getElementById('modal-title');
  const deleteBtn = document.getElementById('modal-delete');

  form.reset();

  if (ticket) {
    title.textContent = 'Edit Repair Ticket';
    deleteBtn.style.display = 'block';
    document.getElementById('ticket-id').value = ticket.id;
    document.getElementById('vehicle-number').value = ticket.vehicleNumber || '';
    document.getElementById('vehicle-name').value = ticket.vehicleName || '';
    document.getElementById('ticket-priority').value = ticket.priority || 'medium';
    document.getElementById('ticket-assignee').value = ticket.assignee || '';
    document.getElementById('repair-type').value = ticket.repairType || 'other';
    document.getElementById('ticket-description').value = ticket.description || '';
    document.getElementById('estimated-hours').value = ticket.estimatedHours || '';
    document.getElementById('mileage').value = ticket.mileage || '';
    document.getElementById('ticket-column').value = ticket.column || 'incoming';
  } else {
    title.textContent = 'New Repair Ticket';
    deleteBtn.style.display = 'none';
    document.getElementById('ticket-id').value = '';
    document.getElementById('ticket-column').value = 'incoming';
  }

  overlay.classList.add('active');
  document.getElementById('vehicle-number').focus();
}

function openEditModal(ticketId) {
  const ticket = tickets.find(t => t.id === ticketId);
  if (ticket) openModal(ticket);
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('active');
}

async function handleFormSubmit(e) {
  e.preventDefault();
  const form = document.getElementById('ticket-form');
  const formData = new FormData(form);

  const id = formData.get('id');
  const vehicleNumber = formData.get('vehicleNumber').trim();

  if (!vehicleNumber) return;

  const ticketData = {
    vehicleNumber,
    vehicleName: formData.get('vehicleName').trim(),
    priority: formData.get('priority'),
    assignee: formData.get('assignee').trim(),
    repairType: formData.get('repairType'),
    description: formData.get('description').trim(),
    estimatedHours: parseFloat(formData.get('estimatedHours')) || 0,
    mileage: formData.get('mileage').trim(),
  };

  try {
    if (id) {
      // Update existing ticket
      await db.collection(COLLECTION).doc(id).update(ticketData);
    } else {
      // Create new ticket
      ticketData.column = 'incoming';
      ticketData.createdAt = new Date().toISOString();
      ticketData.completedAt = null;
      await db.collection(COLLECTION).add(ticketData);
    }
    closeModal();
  } catch (err) {
    console.error('Failed to save ticket:', err);
    alert('Failed to save ticket. Check console for details.');
  }
}

async function handleDelete() {
  const id = document.getElementById('ticket-id').value;
  if (!id) return;

  try {
    await deleteTicket(id);
    closeModal();
  } catch (err) {
    console.error('Failed to delete ticket:', err);
    alert('Failed to delete ticket. Check console for details.');
  }
}

// ── Stats ────────────────────────────────────

function updateStats() {
  const active = tickets.filter(t => t.column !== 'completed').length;
  const urgent = tickets.filter(t => t.priority === 'urgent' && t.column !== 'completed').length;

  const today = new Date().toISOString().split('T')[0];
  const doneToday = tickets.filter(t =>
    t.column === 'completed' &&
    t.completedAt &&
    t.completedAt.startsWith(today)
  ).length;

  document.getElementById('stat-active').textContent = active;
  document.getElementById('stat-urgent').textContent = urgent;
  document.getElementById('stat-done-today').textContent = doneToday;
}

// ── Clock ────────────────────────────────────

function updateClock() {
  const now = new Date();
  const opts = { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
  document.getElementById('fleet-clock').textContent = now.toLocaleDateString('en-US', opts);
}

// ── Helpers ──────────────────────────────────

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getTimeAgo(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return diffMins + 'm ago';
  if (diffHours < 24) return diffHours + 'h ago';
  return diffDays + 'd ago';
}

// ── Init ─────────────────────────────────────

function init() {
  initFirebase();
  subscribeToTickets();
  updateClock();
  setInterval(updateClock, 30000);

  document.getElementById('add-ticket-btn').addEventListener('click', () => openModal());
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });
  document.getElementById('ticket-form').addEventListener('submit', handleFormSubmit);
  document.getElementById('modal-delete').addEventListener('click', handleDelete);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

export { init };
