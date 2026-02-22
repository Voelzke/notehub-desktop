<template>
  <div class="contact-input-container">
    <label class="contact-label">&#128100; Kontakte</label>
    <div class="tag-chips">
      <span v-for="contact in contacts" :key="contact.name" class="tag-chip contact-chip">
        {{ contact.name }}<span v-if="contact.company" class="contact-company"> · {{ contact.company }}</span>
        <button @click="removeContact(contact.name)" class="tag-remove">&times;</button>
      </span>
      <div class="tag-add-wrapper">
        <input
          ref="inputRef"
          v-model="newName"
          @keydown.enter.prevent="addContact"
          @keydown.tab.prevent="selectSuggestion"
          @keydown.escape="showSuggestions = false"
          @input="onInput"
          @focus="onInput"
          @blur="hideSuggestionsDelayed"
          placeholder="Kontakt hinzufügen..."
          class="tag-add-input"
        />
        <div v-if="showSuggestions && filteredSuggestions.length" class="tag-suggestions">
          <div
            v-for="(s, i) in filteredSuggestions"
            :key="s.name"
            @mousedown.prevent="addExisting(s)"
            class="tag-suggestion-item"
            :class="{ active: i === selectedIndex }"
          >
            {{ s.name }}<span v-if="s.company" class="contact-company"> · {{ s.company }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  contacts: Array,
  allContacts: Array
});

const emit = defineEmits(['update']);

const newName = ref('');
const showSuggestions = ref(false);
const selectedIndex = ref(0);
const inputRef = ref(null);

const currentNames = computed(() => new Set((props.contacts || []).map(c => c.name)));

const filteredSuggestions = computed(() => {
  if (!newName.value.trim()) return [];
  const q = newName.value.toLowerCase().trim();
  return props.allContacts
    .filter(c => c.name.toLowerCase().includes(q) && !currentNames.value.has(c.name))
    .slice(0, 8);
});

function onInput() {
  showSuggestions.value = true;
  selectedIndex.value = 0;
}

function hideSuggestionsDelayed() {
  setTimeout(() => { showSuggestions.value = false; }, 200);
}

function addContact() {
  if (filteredSuggestions.value.length > 0) {
    addExisting(filteredSuggestions.value[selectedIndex.value]);
  } else if (newName.value.trim()) {
    addExisting({ name: newName.value.trim() });
  }
}

function selectSuggestion() {
  if (filteredSuggestions.value.length > 0) {
    addExisting(filteredSuggestions.value[selectedIndex.value]);
  }
}

function addExisting(contact) {
  if (!currentNames.value.has(contact.name)) {
    const entry = { name: contact.name };
    if (contact.company) entry.company = contact.company;
    emit('update', [...(props.contacts || []), entry]);
  }
  newName.value = '';
  showSuggestions.value = false;
}

function removeContact(name) {
  emit('update', (props.contacts || []).filter(c => c.name !== name));
}
</script>
