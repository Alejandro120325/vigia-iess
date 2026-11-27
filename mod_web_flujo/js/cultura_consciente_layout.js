/* Ajustes de lectura para la guía de Gmail, aplicados después del CSS que inyecta cultura_consciente.js. */
(function () {
  'use strict';

  var css = `
#cultura-consciente.vg-cc {
  width:100% !important;
  max-width:none !important;
  margin:0 !important;
  padding:16px !important;
  border:1px solid #d9e1eb !important;
  border-radius:12px !important;
  box-shadow:none !important;
  font-family:Arial,Helvetica,sans-serif !important;
}
#cultura-consciente.vg-cc h2 { margin:0 0 5px !important; color:#153b63 !important; font-size:1.05rem !important; line-height:1.35 !important; }
#cultura-consciente.vg-cc h3 { margin:15px 0 7px !important; color:#153b63 !important; font-size:.98rem !important; }
#cultura-consciente.vg-cc > p { margin:4px 0 10px !important; color:#617487 !important; font-size:.83rem !important; line-height:1.55 !important; }
#cultura-consciente .vg-cc__pasos {
  display:grid !important;
  grid-template-columns:repeat(2,minmax(0,1fr)) !important;
  gap:10px !important;
  margin:10px 0 0 !important;
  padding:0 !important;
}
#cultura-consciente .vg-cc__paso {
  display:grid !important;
  grid-template-columns:32px minmax(0,1fr) auto !important;
  align-items:center !important;
  gap:10px !important;
  min-width:0 !important;
  padding:12px !important;
  background:#f7f9fb !important;
  border:1px solid #d9e1eb !important;
  border-radius:10px !important;
}
#cultura-consciente .vg-cc__paso:nth-child(3) { grid-column:1 / -1 !important; }
#cultura-consciente .vg-cc__num {
  width:30px !important; height:30px !important; display:grid !important; place-items:center !important;
  border-radius:8px !important; color:#fff !important; background:#087746 !important;
  font-size:.86rem !important; font-weight:800 !important;
}
#cultura-consciente .vg-cc__txt { min-width:0 !important; }
#cultura-consciente .vg-cc__txt strong { display:block !important; margin:0 0 3px !important; color:#153b63 !important; font-size:.84rem !important; line-height:1.35 !important; }
#cultura-consciente .vg-cc__txt span { display:block !important; color:#617487 !important; font-size:.78rem !important; line-height:1.5 !important; overflow-wrap:anywhere !important; }
#cultura-consciente .vg-cc__btn {
  min-height:34px !important; margin:0 !important; padding:6px 10px !important;
  color:#245f91 !important; background:#fff !important; border:1px solid #d2deea !important;
  border-radius:7px !important; font:700 .74rem Arial,Helvetica,sans-serif !important; white-space:nowrap !important;
}
#cultura-consciente .vg-cc__aviso { margin:12px 0 0 !important; padding:10px 12px !important; border-left:3px solid #c49a48 !important; border-radius:6px !important; font-size:.8rem !important; }
#cultura-consciente .vg-cc__ops { display:grid !important; gap:8px !important; margin:10px 0 !important; }
#cultura-consciente .vg-cc__op { min-height:40px !important; padding:9px 12px !important; font-size:.82rem !important; text-align:left !important; }
#cultura-consciente .vg-cc__fb { font-size:.82rem !important; }
html.tema-oscuro #cultura-consciente.vg-cc { color:#e7edf4 !important; background:#1a2835 !important; border-color:#364b5d !important; }
html.tema-oscuro #cultura-consciente.vg-cc h2,
html.tema-oscuro #cultura-consciente.vg-cc h3,
html.tema-oscuro #cultura-consciente .vg-cc__txt strong { color:#e7edf4 !important; }
html.tema-oscuro #cultura-consciente .vg-cc__txt span,
html.tema-oscuro #cultura-consciente.vg-cc > p { color:#c7d3dc !important; }
html.tema-oscuro #cultura-consciente .vg-cc__paso { background:#202f3e !important; border-color:#40566a !important; }
html.tema-oscuro #cultura-consciente .vg-cc__btn { color:#e7edf4 !important; background:#263747 !important; border-color:#506678 !important; }
@media (max-width:700px) {
  #cultura-consciente .vg-cc__pasos { grid-template-columns:1fr !important; }
  #cultura-consciente .vg-cc__paso:nth-child(3) { grid-column:auto !important; }
}
@media (max-width:440px) {
  #cultura-consciente .vg-cc__paso { grid-template-columns:30px minmax(0,1fr) !important; }
  #cultura-consciente .vg-cc__btn { grid-column:2 !important; justify-self:start !important; }
}
`;

  function install() {
    if (document.getElementById('vigia-cultura-layout-fix')) return;
    var style = document.createElement('style');
    style.id = 'vigia-cultura-layout-fix';
    style.textContent = css;
    document.head.appendChild(style);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once:true });
  } else {
    install();
  }
})();
