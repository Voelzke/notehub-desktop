<template>
  <div class="tag-input-container">
    <div class="tag-chips">
      <span v-for="tag in tags" :key="tag" class="tag-chip">
        {{ tag }}
        <button @click="removeTag(tag)" class="tag-remove">&times;</button>
      </span>
      <div class="tag-add-wrapper">
        <input
          ref="inputRef"
          v-model="newTag"
          @keydown.enter.prevent="addTag"
          @keydown.tab.prevent="selectSuggestion"
          @keydown.escape="showSuggestions = false"
          @input="onInput"
          @focus="onInput"
          @blur="hideSuggestionsDelayed"
          placeholder="Tag hinzufügen..."
          class="tag-add-input"
        />
        <div v-if="showSuggestions && filteredSuggestions.length" class="tag-suggestions">
          <div
            v-for="(s, i) in filteredSuggestions"
            :key="s"
            @mousedown.prevent="addTagValue(s)"
            class="tag-suggestion-item"
            :class="{ active: i === selectedIndex }"
          >
            {{ s }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  tags: Array,
  allTags: Array
});

const emit = defineEmits(['update']);

const newTag = ref('');
const showSuggestions = ref(false);
const selectedIndex = ref(0);
const inputRef = ref(null);

const filteredSuggestions = computed(() => {
  if (!newTag.value.trim()) return [];
  const q = newTag.value.toLowerCase().trim();
  return props.allTags
    .filter(t => t.toLowerCase().includes(q) && !props.tags.includes(t))
    .slice(0, 8);
});

function onInput() {
  showSuggestions.value = true;
  selectedIndex.value = 0;
}

function hideSuggestionsDelayed() {
  setTimeout(() => { showSuggestions.value = false; }, 200);
}

function addTag() {
  if (filteredSuggestions.value.length > 0) {
    addTagValue(filteredSuggestions.value[selectedIndex.value]);
  } else if (newTag.value.trim()) {
    addTagValue(newTag.value.trim());
  }
}

function selectSuggestion() {
  if (filteredSuggestions.value.length > 0) {
    addTagValue(filteredSuggestions.value[selectedIndex.value]);
  }
}

function addTagValue(tag) {
  if (!props.tags.includes(tag)) {
    emit('update', [...props.tags, tag]);
  }
  newTag.value = '';
  showSuggestions.value = false;
}

function removeTag(tag) {
  emit('update', props.tags.filter(t => t !== tag));
}
</script>
