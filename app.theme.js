const Themes = Object.freeze({
  CORONARY_DREAM: 'coronary-dream',
  LIQUID_CRYSTAL: 'liquid-crystal',
  PATH_FINDER: 'path-finder',
  CHROMA_FILE: 'chroma-file'
});

const cycle = Object.values(Themes);

const defaultTheme = Themes.CORONARY_DREAM;
const restoredTheme = localStorage
  .getItem('theme');
let currentTheme = null;

let themeToggle = null;

function setup() {
  themeToggle = document.querySelector(
    '#theme-toggle'
  );

  // do this before hookin in the event handler
  currentTheme = restoredTheme || defaultTheme;
  applyTheme(currentTheme);

  themeToggle.addEventListener('click',
    () => {
      let index = cycle.indexOf(
        currentTheme
      );
      index = (index + 1) % cycle.length;
      const newTheme = cycle[index];

      applyTheme(newTheme);
    });
}

function applyTheme(theme) {
  const themeClass = `theme-${theme}`;
  currentTheme = theme;

  const index = cycle.indexOf(theme) + 1;
  const active = themeToggle
    .querySelector(`.theme-${index}`);
  const current = themeToggle
    .querySelector('.theme-active');
  
  if (current) {
    current.classList.remove('theme-active');
  }
  active.classList.add('theme-active');

  // prevent flashes in certain cases
  const remove = Object.values(Themes)
    .map((t) => `theme-${t}`)
    .filter((cls) => cls !== themeClass);
  document.body.classList.remove(...remove);
  if (!document.body.classList.contains(
    themeClass
  )) {
    document.body.classList.add(themeClass);
  }

  if (currentTheme !== defaultTheme) {
    localStorage.setItem('theme', theme);
  } else {
    localStorage.removeItem('theme');
  }
}

export {
  setup,
  Themes
};