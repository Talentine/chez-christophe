/* ============================================================
   SVG ICONS — Lucide-style outline, remplace les emojis par des icônes propres
   Match du proto Claude Design (style ink coffee outline)
   ============================================================ */
(function(){
  'use strict';

  const ICON = (paths, vb) => '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="' + (vb || '0 0 24 24') + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';

  const ICONS = {
    // Personne / identité
    user:   ICON('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
    users:  ICON('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
    // Lieu
    pin:    ICON('<path d="M20 10c0 7-8 13-8 13s-8-6-8-13a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>'),
    // Temps
    clock:  ICON('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
    timer:  ICON('<line x1="10" y1="2" x2="14" y2="2"/><line x1="12" y1="14" x2="15" y2="11"/><circle cx="12" cy="14" r="8"/>'),
    cal:    ICON('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'),
    // Produits
    leaf:   ICON('<path d="M11 20A7 7 0 0 1 4 13c0-7 9-9 16-9 0 7-2 16-9 16Z"/><path d="M2 22c4-3 9-7 13-13"/>'),
    box:    ICON('<path d="m21 16-9 5-9-5V8l9-5 9 5v8z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>'),
    bag:    ICON('<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>'),
    // Communication
    bell:   ICON('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>'),
    chat:   ICON('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
    phone:  ICON('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>'),
    // Action
    spark:  ICON('<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="3"/>'),
    star:   ICON('<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'),
    truck:  ICON('<rect x="1" y="3" width="15" height="13" rx="1"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>'),
    search: ICON('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'),
    // Compte / paiement
    gear:   ICON('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
    card:   ICON('<rect x="2" y="5" width="20" height="14" rx="2" ry="2"/><line x1="2" y1="10" x2="22" y2="10"/>'),
    key:    ICON('<path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>'),
    lock:   ICON('<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
    swap:   ICON('<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>'),
    grad:   ICON('<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>'),
    qr:     ICON('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><line x1="14" y1="14" x2="14" y2="17"/><line x1="14" y1="20" x2="14" y2="21"/><line x1="17" y1="14" x2="17" y2="14"/><line x1="20" y1="14" x2="20" y2="14"/><line x1="17" y1="17" x2="17" y2="17"/><line x1="17" y1="20" x2="17" y2="20"/><line x1="20" y1="17" x2="20" y2="17"/><line x1="20" y1="20" x2="20" y2="20"/>'),
    // Édition
    edit:   ICON('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>'),
    image:  ICON('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>'),
    palette:ICON('<circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>'),
    link:   ICON('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'),
    // Alerte
    alert:  ICON('<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12" y2="17"/>'),
    trash:  ICON('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
    plus:   ICON('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
    arrow:  ICON('<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>'),
    chev:   ICON('<polyline points="9 18 15 12 9 6"/>'),
  };

  // Map emoji → nom d'icône
  const EMOJI_MAP = {
    '🆔': 'user',         '👤': 'user',          '👥': 'users',
    '📍': 'pin',           '🌐': 'pin',
    '🕐': 'clock',         '⏰': 'clock',         '⏱': 'timer',
    '📅': 'cal',           '🗓': 'cal',           '🗓️': 'cal',
    '🥕': 'leaf',          '🌿': 'leaf',          '🍴': 'leaf',
    '📦': 'box',           '🛍': 'bag',           '🛒': 'bag',
    '🔔': 'bell',          '🚨': 'bell',
    '💬': 'chat',          '✉️': 'chat',          '📧': 'chat',
    '📞': 'phone',         '☎️': 'phone',
    '✨': 'spark',         '⭐': 'star',          '🎯': 'spark',
    '🚚': 'truck',
    '🔍': 'search',        '🔎': 'search',
    '⚙️': 'gear',          '⚙': 'gear',
    '💳': 'card',          '💰': 'card',
    '🔑': 'key',
    '🔒': 'lock',          '🛡️': 'lock',
    '🔁': 'swap',          '🔄': 'swap',
    '🎓': 'grad',
    '📱': 'qr',
    '✏️': 'edit',          '📝': 'edit',
    '📸': 'image',         '🖼': 'image',         '🖼️': 'image',
    '🎨': 'palette',
    '🔗': 'link',
    '⚠️': 'alert',         '⚠': 'alert',
    '🗑': 'trash',         '🗑️': 'trash',
    '➕': 'plus',          '+': 'plus',
    '→': 'arrow',
    '›': 'chev',           '>': 'chev',
  };

  function replaceIcons() {
    // 1. Remplace les emojis dans .reg-icon
    document.querySelectorAll('.reg-icon').forEach(el => {
      if (el.dataset.svgDone) return;
      const txt = (el.textContent || '').trim();
      // Garde les emojis qui sont dans la map, sinon laisse l'emoji
      const iconName = EMOJI_MAP[txt];
      if (iconName && ICONS[iconName]) {
        el.innerHTML = ICONS[iconName];
        el.dataset.svgDone = '1';
      }
    });

    // 2. Remplace les chevrons
    document.querySelectorAll('.reg-chevron').forEach(el => {
      if (el.dataset.svgDone) return;
      el.innerHTML = ICONS.chev;
      el.dataset.svgDone = '1';
    });
  }

  // Run on load + observe le DOM pour les éléments injectés tardivement
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', replaceIcons);
  } else replaceIcons();

  // Re-run après le tour interactif et autres injections async
  setTimeout(replaceIcons, 500);
  setTimeout(replaceIcons, 2000);

  // Expose pour appel manuel
  window.marcheoReplaceIcons = replaceIcons;
  window.MARCHEO_ICONS = ICONS;
})();
