import { ref, watchEffect } from 'vue';

const theme = ref('dark');

export function useTheme() {
  function detectSystemTheme() {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    theme.value = prefersDark ? 'dark' : 'light';
  }

  function initTheme() {
    detectSystemTheme();
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', detectSystemTheme);
  }

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark';
  }

  watchEffect(() => {
    document.documentElement.setAttribute('data-theme', theme.value);
  });

  return { theme, initTheme, toggleTheme };
}
