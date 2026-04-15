// MAIN world에서 실행 — window.monaco에 직접 접근 가능
// isolated world의 programmers_content.js와 window 이벤트로 통신

window.addEventListener('algonotion-request-code', () => {
  let code = '';
  try {
    const models = window.monaco?.editor?.getModels?.();
    if (models && models.length > 0) {
      code = models[0].getValue() || '';
    }
  } catch (e) {}
  window.dispatchEvent(new CustomEvent('algonotion-code-response', { detail: code }));
});
