const observer = new ResizeObserver(entries => {
  for (const entry of entries) entry.target.style.setProperty('--preview-scale', entry.contentRect.width / 1440);
});
for (const preview of document.querySelectorAll('.preview')) observer.observe(preview);
