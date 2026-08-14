(function(){
"use strict";
function closeMenu(){document.querySelector('.bf-app-menu-pop.bf-show')?.classList.remove('bf-show');document.querySelector('.bf-app-menu-btn.bf-open')?.classList.remove('bf-open')}
window.addEventListener('pageshow',closeMenu);
window.addEventListener('orientationchange',closeMenu);
window.addEventListener('bf:ui-mode',closeMenu);
})();
