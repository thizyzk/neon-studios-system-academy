var e=class extends Event{oldState;newState;constructor(e,{oldState:t=``,newState:n=``,...r}={}){super(e,r),this.oldState=String(t||``),this.newState=String(n||``)}},t=new WeakMap;function n(n,r,i){t.set(n,setTimeout(()=>{t.has(n)&&n.dispatchEvent(new e(`toggle`,{cancelable:!1,oldState:r,newState:i}))},0))}var r=globalThis.ShadowRoot||function(){},i=globalThis.HTMLDialogElement||function(){},a=new WeakMap,o=new WeakMap,s=new WeakMap,c=new WeakMap;function l(e){return c.get(e)||`hidden`}var u=new WeakMap;function d(e){return[...e].pop()}function f(e){let t=e.popoverTargetElement;if(!(t instanceof HTMLElement))return;let n=l(t);e.popoverTargetAction===`show`&&n===`showing`||e.popoverTargetAction===`hide`&&n===`hidden`||(n===`showing`?D(t,!0,!0):p(t,!1)&&(u.set(t,e),E(t)))}function p(e,t){return!(e.popover!==`auto`&&e.popover!==`manual`&&e.popover!==`hint`||!e.isConnected||t&&l(e)!==`showing`||!t&&l(e)!==`hidden`||e instanceof i&&e.hasAttribute(`open`)||document.fullscreenElement===e)}function m(e){if(!e)return 0;let t=o.get(document)||new Set,n=s.get(document)||new Set;return n.has(e)?[...n].indexOf(e)+t.size+1:t.has(e)?[...t].indexOf(e)+1:0}function h(e){let t=y(e),n=b(e);return m(t)>m(n)?t:n}function g(e){let t,n=s.get(e)||new Set,r=o.get(e)||new Set,i=n.size>0?n:r.size>0?r:null;return i?(t=d(i),t.isConnected?t:(i.delete(t),g(e))):null}function _(e){for(let t of e||[])if(!t.isConnected)e.delete(t);else return t;return null}function v(e){return typeof e.getRootNode==`function`?e.getRootNode():e.parentNode?v(e.parentNode):e}function y(e){for(;e;){if(e instanceof HTMLElement&&e.popover===`auto`&&c.get(e)===`showing`)return e;if(e=e instanceof Element&&e.assignedSlot||e.parentElement||v(e),e instanceof r&&(e=e.host),e instanceof Document)return}}function b(e){for(;e;){let t=e.popoverTargetElement;if(t instanceof HTMLElement)return t;if(e=e.parentElement||v(e),e instanceof r&&(e=e.host),e instanceof Document)return}}function x(e,t){let n=new Map,r=0;for(let e of t||[])n.set(e,r),r+=1;n.set(e,r),r+=1;let i=null;function a(t){if(!t)return;let r=!1,a=null,o=null;for(;!r;){if(a=y(t)||null,a===null||!n.has(a))return;(e.popover===`hint`||a.popover===`auto`)&&(r=!0),r||(t=a.parentElement)}o=n.get(a),(i===null||n.get(i)<o)&&(i=a)}return a(e.parentElement||v(e)),i}function S(e){return e.hidden||e instanceof r||(e instanceof HTMLButtonElement||e instanceof HTMLInputElement||e instanceof HTMLSelectElement||e instanceof HTMLTextAreaElement||e instanceof HTMLOptGroupElement||e instanceof HTMLOptionElement||e instanceof HTMLFieldSetElement)&&e.disabled||e instanceof HTMLInputElement&&e.type===`hidden`||e instanceof HTMLAnchorElement&&e.href===``?!1:typeof e.tabIndex==`number`&&e.tabIndex!==-1}function C(e){if(e.shadowRoot&&e.shadowRoot.delegatesFocus!==!0)return null;let t=e;t.shadowRoot&&(t=t.shadowRoot);let n=t.querySelector(`[autofocus]`);if(n)return n;{let e=t.querySelectorAll(`slot`);for(let t of e){let e=t.assignedElements({flatten:!0});for(let t of e)if(t.hasAttribute(`autofocus`))return t;else if(n=t.querySelector(`[autofocus]`),n)return n}}let r=e.ownerDocument.createTreeWalker(t,NodeFilter.SHOW_ELEMENT),i=r.currentNode;for(;i;){if(S(i))return i;i=r.nextNode()}}function w(e){var t;(t=C(e))==null||t.focus()}var T=new WeakMap;function E(t){if(!p(t,!1))return;let r=t.ownerDocument;if(!t.dispatchEvent(new e(`beforetoggle`,{cancelable:!0,oldState:`closed`,newState:`open`}))||!p(t,!1))return;let i=!1,l=t.popover,d=null,f=x(t,o.get(r)||new Set),m=x(t,s.get(r)||new Set);if(l===`auto`&&(k(s.get(r)||new Set,i,!0),j(f||r,i,!0),d=`auto`),l===`hint`&&(m?(j(m,i,!0),d=`hint`):(k(s.get(r)||new Set,i,!0),f?(j(f,i,!0),d=`auto`):d=`hint`)),l===`auto`||l===`hint`){if(l!==t.popover||!p(t,!1))return;g(r)||(i=!0),d===`auto`?(o.has(r)||o.set(r,new Set),o.get(r).add(t)):d===`hint`&&(s.has(r)||s.set(r,new Set),s.get(r).add(t))}T.delete(t);let h=r.activeElement;t.classList.add(`:popover-open`),c.set(t,`showing`),a.has(r)||a.set(r,new Set),a.get(r).add(t),F(u.get(t),!0),w(t),i&&h&&t.popover===`auto`&&T.set(t,h),n(t,`closed`,`open`)}function D(t,r=!1,i=!1){var l,f;if(!p(t,!0))return;let m=t.ownerDocument;if([`auto`,`hint`].includes(t.popover)&&(j(t,r,i),!p(t,!0)))return;let h=o.get(m)||new Set,g=h.has(t)&&d(h)===t;if(F(u.get(t),!1),u.delete(t),i&&(t.dispatchEvent(new e(`beforetoggle`,{oldState:`open`,newState:`closed`})),g&&d(h)!==t&&j(t,r,i),!p(t,!0)))return;(l=a.get(m))==null||l.delete(t),h.delete(t),(f=s.get(m))==null||f.delete(t),t.classList.remove(`:popover-open`),c.set(t,`hidden`),i&&n(t,`open`,`closed`);let _=T.get(t);_&&(T.delete(t),r&&_.focus())}function O(e,t=!1,n=!1){let r=g(e);for(;r;)D(r,t,n),r=g(e)}function k(e,t=!1,n=!1){let r=_(e);for(;r;)D(r,t,n),r=_(e)}function A(e,t,n,r){let i=!1,a=!1;for(;i||!a;){a=!0;let o=null,s=!1;for(let n of t)if(n===e)s=!0;else if(s){o=n;break}if(!o)return;for(;l(o)===`showing`&&t.size;)D(d(t),n,r);t.has(e)&&d(t)!==e&&(i=!0),i&&(r=!1)}}function j(e,t,n){let r=e.ownerDocument||e;if(e instanceof Document)return O(r,t,n);if(s.get(r)?.has(e)){A(e,s.get(r),t,n);return}k(s.get(r)||new Set,t,n),o.get(r)?.has(e)&&A(e,o.get(r),t,n)}var M=new WeakMap;function N(e){if(!e.isTrusted)return;let t=e.composedPath()[0];if(!t)return;let n=t.ownerDocument;if(!g(n))return;let r=h(t);if(r&&e.type===`pointerdown`)M.set(n,r);else if(e.type===`pointerup`){let e=M.get(n)===r;M.delete(n),e&&j(r||n,!1,!0)}}var P=new WeakMap;function F(e,t=!1){if(!e)return;P.has(e)||P.set(e,e.getAttribute(`aria-expanded`));let n=e.popoverTargetElement;if(n instanceof HTMLElement&&n.popover===`auto`)e.setAttribute(`aria-expanded`,String(t));else{let t=P.get(e);t?e.setAttribute(`aria-expanded`,t):e.removeAttribute(`aria-expanded`)}}var I=globalThis.ShadowRoot||function(){};function L(){return typeof HTMLElement<`u`&&typeof HTMLElement.prototype==`object`&&`popover`in HTMLElement.prototype}function R(e,t,n){let r=e[t];Object.defineProperty(e,t,{value(e){return r.call(this,n(e))}})}var z=/(^|[^\\]):popover-open\b/g;function B(){return typeof globalThis.CSSLayerBlockRule==`function`}function V(){let e=B();return`
${e?`@layer popover-polyfill {`:``}
  :where([popover]) {
    position: fixed;
    z-index: 2147483647;
    inset: 0;
    padding: 0.25em;
    width: fit-content;
    height: fit-content;
    border-width: initial;
    border-color: initial;
    border-image: initial;
    border-style: solid;
    background-color: canvas;
    color: canvastext;
    overflow: auto;
    margin: auto;
  }

  :where([popover]:not(.\\:popover-open)) {
    display: none;
  }

  :where(dialog[popover].\\:popover-open) {
    display: block;
  }

  :where(dialog[popover][open]) {
    display: revert;
  }

  :where([anchor].\\:popover-open) {
    inset: auto;
  }

  :where([anchor]:popover-open) {
    inset: auto;
  }

  @supports not (background-color: canvas) {
    :where([popover]) {
      background-color: white;
      color: black;
    }
  }

  @supports (width: -moz-fit-content) {
    :where([popover]) {
      width: -moz-fit-content;
      height: -moz-fit-content;
    }
  }

  @supports not (inset: 0) {
    :where([popover]) {
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
    }
  }
${e?`}`:``}
`}var H=null;function U(e){let t=V();if(H===null)try{H=new CSSStyleSheet,H.replaceSync(t)}catch{H=!1}if(H===!1){let n=document.createElement(`style`);n.textContent=t,e instanceof Document?e.head.prepend(n):e.prepend(n)}else e.adoptedStyleSheets=[H,...e.adoptedStyleSheets]}function W(){if(typeof window>`u`)return;window.ToggleEvent=window.ToggleEvent||e;function t(e){return e?.includes(`:popover-open`)&&(e=e.replace(z,`$1.\\:popover-open`)),e}R(Document.prototype,`querySelector`,t),R(Document.prototype,`querySelectorAll`,t),R(Element.prototype,`querySelector`,t),R(Element.prototype,`querySelectorAll`,t),R(Element.prototype,`matches`,t),R(Element.prototype,`closest`,t),R(DocumentFragment.prototype,`querySelectorAll`,t),Object.defineProperties(HTMLElement.prototype,{popover:{enumerable:!0,configurable:!0,get(){if(!this.hasAttribute(`popover`))return null;let e=(this.getAttribute(`popover`)||``).toLowerCase();return e===``||e==`auto`?`auto`:e==`hint`?`hint`:`manual`},set(e){e===null?this.removeAttribute(`popover`):this.setAttribute(`popover`,e)}},showPopover:{enumerable:!0,configurable:!0,value(e={}){E(this)}},hidePopover:{enumerable:!0,configurable:!0,value(){D(this,!0,!0)}},togglePopover:{enumerable:!0,configurable:!0,value(e={}){return typeof e==`boolean`&&(e={force:e}),c.get(this)===`showing`&&e.force===void 0||e.force===!1?D(this,!0,!0):(e.force===void 0||e.force===!0)&&E(this),c.get(this)===`showing`}}});let n=Element.prototype.attachShadow;n&&Object.defineProperties(Element.prototype,{attachShadow:{enumerable:!0,configurable:!0,writable:!0,value(e){let t=n.call(this,e);return U(t),t}}});let r=HTMLElement.prototype.attachInternals;r&&Object.defineProperties(HTMLElement.prototype,{attachInternals:{enumerable:!0,configurable:!0,writable:!0,value(){let e=r.call(this);return e.shadowRoot&&U(e.shadowRoot),e}}});let i=new WeakMap;function a(e){Object.defineProperties(e.prototype,{popoverTargetElement:{enumerable:!0,configurable:!0,set(e){if(e===null)this.removeAttribute(`popovertarget`),i.delete(this);else if(e instanceof Element)this.setAttribute(`popovertarget`,``),i.set(this,e);else throw TypeError(`popoverTargetElement must be an element or null`)},get(){if(this.localName!==`button`&&this.localName!==`input`||this.localName===`input`&&this.type!==`reset`&&this.type!==`image`&&this.type!==`button`||this.disabled||this.form&&this.type===`submit`)return null;let e=i.get(this);if(e&&e.isConnected)return e;if(e&&!e.isConnected)return i.delete(this),null;let t=v(this),n=this.getAttribute(`popovertarget`);return(t instanceof Document||t instanceof I)&&n&&t.getElementById(n)||null}},popoverTargetAction:{enumerable:!0,configurable:!0,get(){let e=(this.getAttribute(`popovertargetaction`)||``).toLowerCase();return e===`show`||e===`hide`?e:`toggle`},set(e){this.setAttribute(`popovertargetaction`,e)}}})}a(HTMLButtonElement),a(HTMLInputElement);let o=e=>{if(e.defaultPrevented)return;let t=e.composedPath(),n=t[0];if(!(n instanceof Element)||n?.shadowRoot)return;let r=v(n);if(!(r instanceof I||r instanceof Document))return;let i=t.find(e=>e.matches?.call(e,`[popovertargetaction],[popovertarget]`));if(i){f(i),e.preventDefault();return}},s=e=>{let t=e.key,n=e.target;!e.defaultPrevented&&n&&(t===`Escape`||t===`Esc`)&&j(n.ownerDocument,!0,!0)};(e=>{e.addEventListener(`click`,o),e.addEventListener(`keydown`,s),e.addEventListener(`pointerdown`,N),e.addEventListener(`pointerup`,N)})(document),U(document)}L()||W();
//# sourceMappingURL=popover-DAvQ1HXE.js.map