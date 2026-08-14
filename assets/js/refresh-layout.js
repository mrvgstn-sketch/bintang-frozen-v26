(function(){
"use strict";
function closeTransient(){document.querySelectorAll(".bf-app-menu-pop.bf-show").forEach(x=>x.classList.remove("bf-show"));}
window.addEventListener("pageshow",closeTransient);
})();
