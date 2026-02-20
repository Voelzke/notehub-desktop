<template>
  <div class="task-bar" v-if="note.frontmatter?.type === 'task'">
    <div class="task-field">
      <label>Status</label>
      <select :value="note.frontmatter.status || 'open'" @change="updateField('status', $event.target.value)">
        <option value="open">Offen</option>
        <option value="in-progress">In Arbeit</option>
        <option value="done">Erledigt</option>
      </select>
    </div>
    <div class="task-field">
      <label>Priorität</label>
      <select :value="note.frontmatter.priority || 2" @change="updateField('priority', parseInt($event.target.value))">
        <option :value="1">Hoch</option>
        <option :value="2">Mittel</option>
        <option :value="3">Niedrig</option>
      </select>
    </div>
    <div class="task-field">
      <label>Fällig</label>
      <input type="datetime-local" :value="toDatetimeLocal(note.frontmatter.due)" @change="updateDatetime('due', $event.target.value)" />
    </div>
    <div class="task-field">
      <label>Start</label>
      <input type="datetime-local" :value="toDatetimeLocal(note.frontmatter.start)" @change="updateDatetime('start', $event.target.value)" />
    </div>
    <div class="task-field">
      <label>Person</label>
      <input type="text" :value="note.frontmatter.person || ''" @change="updateField('person', $event.target.value || undefined)" placeholder="Person..." />
    </div>
    <div class="task-field">
      <label>Erinnerung</label>
      <input type="datetime-local" :value="toDatetimeLocal(note.frontmatter.remind)" @change="updateDatetime('remind', $event.target.value)" />
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  note: Object
});

const emit = defineEmits(['update-frontmatter']);

function toDatetimeLocal(val) {
  if (!val) return '';
  const s = val instanceof Date ? val.toISOString().slice(0, 16) : String(val);
  // "2026-03-01" → "2026-03-01T00:00", "2026-03-01 14:30" → "2026-03-01T14:30"
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s + 'T00:00';
  return s.replace(' ', 'T').slice(0, 16);
}

function updateDatetime(field, value) {
  if (!value) {
    updateField(field, undefined);
  } else {
    // "2026-03-01T14:30" → "2026-03-01 14:30"
    updateField(field, value.replace('T', ' '));
  }
}

function updateField(field, value) {
  const fm = { ...props.note.frontmatter };
  if (value === undefined || value === '') {
    delete fm[field];
  } else {
    fm[field] = value;
  }
  emit('update-frontmatter', fm);
}
</script>
