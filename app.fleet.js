// Fleet Repair Tracking System
// Columns, ticketing, drag-and-drop, and localStorage persistence

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

const STORAGE_KEY = 'fleet-repair-tickets';

let tickets = [];
let draggedTicketId = null;
let draggedElement = null;

// ── Persistence ──────────────────────────────

function loadTickets() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      tickets = JSON.parse(stored);
    } else {
      tickets = getSampleTickets();
      saveTickets();
    }
  } catch {
    tickets = getSampleTickets();
  }
}

function saveTickets() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
}

function generateId() {
  return 'TK-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 5).toUpperCase();
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
  card.dataset.priority = ticket.priority;
  card.draggable = true;

  const priorityLabel = ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1);
  const repairLabel = REPAIR_TYPE_LABELS[ticket.repairType] || ticket.repairType;
  const timeAgo = getTimeAgo(ticket.createdAt);

  card.innerHTML = `
    <div class="ticket-card__header">
      <div class="ticket-card__vehicle-number">#${escapeHtml(ticket.vehicleNumber)}</div>
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
        <span class="ticket-card__badge badge--priority-${ticket.priority}">${priorityLabel}</span>
      </div>
    </div>
    <div class="ticket-card__footer">
      <span class="ticket-card__assignee">${ticket.assignee ? escapeHtml(ticket.assignee) : 'Unassigned'}</span>
      <span class="ticket-card__time">${ticket.estimatedHours ? ticket.estimatedHours + 'h est' : ''}${ticket.mileage ? ' · ' + escapeHtml(ticket.mileage) + ' mi' : ''}</span>
    </div>
    <div class="ticket-card__ticket-id">${ticket.id} · ${timeAgo}</div>
  `;

  // Edit button handler
  card.querySelector('.ticket-card__edit').addEventListener('click', (e) => {
    e.stopPropagation();
    openEditModal(ticket.id);
  });

  // Drag handlers
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

    // Show drop placeholder
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

    // Remove empty state
    const emptyEl = container.querySelector('.fleet-column__empty');
    if (emptyEl) emptyEl.remove();
  });

  container.addEventListener('dragleave', (e) => {
    // Only handle if we're actually leaving the container
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

    // Find the ticket and determine new position
    const ticket = tickets.find(t => t.id === ticketId);
    if (!ticket) return;

    const oldColumn = ticket.column;
    ticket.column = newColumn;

    // Determine insert position based on where dropped
    const afterElement = getDragAfterElement(container, e.clientY);
    const columnTickets = tickets.filter(t => t.column === newColumn && t.id !== ticketId);

    if (afterElement) {
      const afterId = afterElement.dataset.id;
      const afterIndex = columnTickets.findIndex(t => t.id === afterId);
      // We don't need exact ordering for now since we sort by priority
    }

    if (newColumn === 'completed' && oldColumn !== 'completed') {
      ticket.completedAt = new Date().toISOString();
    }

    saveTickets();
    renderBoard();
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
    document.getElementById('vehicle-number').value = ticket.vehicleNumber;
    document.getElementById('vehicle-name').value = ticket.vehicleName || '';
    document.getElementById('ticket-priority').value = ticket.priority;
    document.getElementById('ticket-assignee').value = ticket.assignee || '';
    document.getElementById('repair-type').value = ticket.repairType || 'other';
    document.getElementById('ticket-description').value = ticket.description || '';
    document.getElementById('estimated-hours').value = ticket.estimatedHours || '';
    document.getElementById('mileage').value = ticket.mileage || '';
    document.getElementById('ticket-column').value = ticket.column;
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

function handleFormSubmit(e) {
  e.preventDefault();
  const form = document.getElementById('ticket-form');
  const formData = new FormData(form);

  const id = formData.get('id');
  const vehicleNumber = formData.get('vehicleNumber').trim();

  if (!vehicleNumber) return;

  if (id) {
    // Edit existing
    const ticket = tickets.find(t => t.id === id);
    if (ticket) {
      ticket.vehicleNumber = vehicleNumber;
      ticket.vehicleName = formData.get('vehicleName').trim();
      ticket.priority = formData.get('priority');
      ticket.assignee = formData.get('assignee').trim();
      ticket.repairType = formData.get('repairType');
      ticket.description = formData.get('description').trim();
      ticket.estimatedHours = parseFloat(formData.get('estimatedHours')) || 0;
      ticket.mileage = formData.get('mileage').trim();
    }
  } else {
    // New ticket
    const newTicket = {
      id: generateId(),
      vehicleNumber,
      vehicleName: formData.get('vehicleName').trim(),
      priority: formData.get('priority'),
      assignee: formData.get('assignee').trim(),
      repairType: formData.get('repairType'),
      description: formData.get('description').trim(),
      estimatedHours: parseFloat(formData.get('estimatedHours')) || 0,
      mileage: formData.get('mileage').trim(),
      column: 'incoming',
      createdAt: new Date().toISOString(),
      completedAt: null,
    };
    tickets.push(newTicket);
  }

  saveTickets();
  renderBoard();
  closeModal();
}

function handleDelete() {
  const id = document.getElementById('ticket-id').value;
  if (!id) return;
  tickets = tickets.filter(t => t.id !== id);
  saveTickets();
  renderBoard();
  closeModal();
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

// ── Sample Data ──────────────────────────────

function getSampleTickets() {
  const now = new Date();
  return [
    {
      id: 'TK-001',
      vehicleNumber: '4501',
      vehicleName: '2019 Freightliner Cascadia',
      priority: 'urgent',
      assignee: 'Mike S.',
      repairType: 'engine',
      description: 'Engine overheating under load. Coolant leak suspected near thermostat housing.',
      estimatedHours: 6,
      mileage: '342,100',
      column: 'in-repair',
      createdAt: new Date(now - 2 * 3600000).toISOString(),
      completedAt: null,
    },
    {
      id: 'TK-002',
      vehicleNumber: '2287',
      vehicleName: '2021 Peterbilt 579',
      priority: 'high',
      assignee: 'Dave R.',
      repairType: 'brakes',
      description: 'Front brake pads worn below minimum. Rotors need inspection.',
      estimatedHours: 4,
      mileage: '198,500',
      column: 'in-repair',
      createdAt: new Date(now - 5 * 3600000).toISOString(),
      completedAt: null,
    },
    {
      id: 'TK-003',
      vehicleNumber: '7733',
      vehicleName: '2020 Kenworth T680',
      priority: 'medium',
      assignee: '',
      repairType: 'electrical',
      description: 'Intermittent no-start condition. Battery tested good, suspect starter relay.',
      estimatedHours: 3,
      mileage: '275,000',
      column: 'incoming',
      createdAt: new Date(now - 1 * 3600000).toISOString(),
      completedAt: null,
    },
    {
      id: 'TK-004',
      vehicleNumber: '1190',
      vehicleName: '2018 Volvo VNL 860',
      priority: 'high',
      assignee: 'Tony M.',
      repairType: 'transmission',
      description: 'Hard shifting between 3rd and 4th gear. Transmission fluid is dark.',
      estimatedHours: 8,
      mileage: '410,200',
      column: 'waiting-parts',
      createdAt: new Date(now - 24 * 3600000).toISOString(),
      completedAt: null,
    },
    {
      id: 'TK-005',
      vehicleNumber: '5560',
      vehicleName: '2022 International LT',
      priority: 'low',
      assignee: 'Mike S.',
      repairType: 'oil-change',
      description: 'Regular PM service. Oil change, filter replacement, and multi-point inspection.',
      estimatedHours: 2,
      mileage: '89,300',
      column: 'incoming',
      createdAt: new Date(now - 3 * 3600000).toISOString(),
      completedAt: null,
    },
    {
      id: 'TK-006',
      vehicleNumber: '3345',
      vehicleName: '2017 Mack Anthem',
      priority: 'medium',
      assignee: 'Dave R.',
      repairType: 'hvac',
      description: 'A/C not blowing cold. Compressor clutch not engaging.',
      estimatedHours: 4,
      mileage: '520,100',
      column: 'diagnosing',
      createdAt: new Date(now - 8 * 3600000).toISOString(),
      completedAt: null,
    },
    {
      id: 'TK-007',
      vehicleNumber: '8821',
      vehicleName: '2020 Freightliner M2 106',
      priority: 'urgent',
      assignee: 'Tony M.',
      repairType: 'tires',
      description: 'Blowout on rear driver side dual. Both tires need replacement. Rim damage check required.',
      estimatedHours: 3,
      mileage: '156,700',
      column: 'waiting-parts',
      createdAt: new Date(now - 4 * 3600000).toISOString(),
      completedAt: null,
    },
    {
      id: 'TK-008',
      vehicleNumber: '6102',
      vehicleName: '2019 Kenworth W990',
      priority: 'low',
      assignee: 'Mike S.',
      repairType: 'inspection',
      description: 'Annual DOT inspection due. Schedule for full safety inspection.',
      estimatedHours: 3,
      mileage: '301,400',
      column: 'incoming',
      createdAt: new Date(now - 12 * 3600000).toISOString(),
      completedAt: null,
    },
    {
      id: 'TK-009',
      vehicleNumber: '9944',
      vehicleName: '2021 Volvo VNR 640',
      priority: 'medium',
      assignee: 'Dave R.',
      repairType: 'suspension',
      description: 'Driver reports rough ride. Possible air bag leak on rear suspension.',
      estimatedHours: 5,
      mileage: '167,800',
      column: 'diagnosing',
      createdAt: new Date(now - 6 * 3600000).toISOString(),
      completedAt: null,
    },
    {
      id: 'TK-010',
      vehicleNumber: '4120',
      vehicleName: '2018 Peterbilt 389',
      priority: 'low',
      assignee: 'Tony M.',
      repairType: 'body',
      description: 'Minor fender damage from dock contact. Cosmetic repair needed.',
      estimatedHours: 6,
      mileage: '445,000',
      column: 'completed',
      createdAt: new Date(now - 48 * 3600000).toISOString(),
      completedAt: new Date(now - 2 * 3600000).toISOString(),
    },
  ];
}

// ── Init ─────────────────────────────────────

function init() {
  loadTickets();
  renderBoard();
  updateClock();
  setInterval(updateClock, 30000);

  // New ticket button
  document.getElementById('add-ticket-btn').addEventListener('click', () => openModal());

  // Modal close/cancel
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Form submit
  document.getElementById('ticket-form').addEventListener('submit', handleFormSubmit);

  // Delete button
  document.getElementById('modal-delete').addEventListener('click', handleDelete);

  // Close modal on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
}

export { init };
