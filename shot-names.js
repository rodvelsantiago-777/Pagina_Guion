/* Secuencias de nombres: números y letras con acarreo como en Excel. */
(function (root) {
  "use strict";
  function next(name) {
    const value = String(name || "1").trim();
    const numbers = value.match(/^(.*?)(\d+)$/u);
    if (numbers) return numbers[1] + String(BigInt(numbers[2]) + 1n).padStart(numbers[2].length, "0");
    const letters = value.match(/^(.*?)([a-z]+)$/i);
    if (letters) {
      const original = letters[2];
      const chars = letters[2].toUpperCase().split("");
      let carry = true;
      for (let i = chars.length - 1; i >= 0 && carry; i--) {
        if (chars[i] === "Z") chars[i] = "A";
        else { chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1); carry = false; }
      }
      if (carry) chars.unshift("A");
      const extra = chars.length - original.length;
      const suffix = chars.map((char, i) => {
        const model = original[Math.max(0, i - extra)];
        return model === model.toLowerCase() ? char.toLowerCase() : char;
      }).join("");
      return letters[1] + suffix;
    }
    return value.slice(0, 118) + " 2";
  }
  function suggest(annotations, scenes, target, sceneAt) {
    const sceneFor = item => sceneAt(scenes, item.page, item.type === "line" ? item.start.y : item.rects[0].y)?.id || "intro";
    const targetScene = sceneFor(target);
    const seen = new Set();
    const shots = annotations.filter(item => {
      const id = item.shotId || item.id;
      if (seen.has(id)) return false;
      seen.add(id); return Boolean(item.shotName);
    });
    const here = shots.filter(item => sceneFor(item) === targetScene);
    if (here.length) return next(here.at(-1).shotName).slice(0, 120);
    const index = scenes.findIndex(scene => scene.id === targetScene);
    for (let i = index - 1; i >= -1; i--) {
      const first = shots.find(item => sceneFor(item) === (scenes[i]?.id || "intro"));
      if (first) return nextScene(first.shotName);
    }
    return "1";
  }
  function nextScene(name) {
    // 1A, 1B… pasa a 2A en la escena siguiente; P1A pasa a P2A.
    const composite = name.match(/^(.*?)(\d+)([a-z]+)$/i);
    return composite ? composite[1] + String(BigInt(composite[2]) + 1n).padStart(composite[2].length, "0") + composite[3] : next(name);
  }
  const api = { next, nextScene, suggest };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PlanoShotNames = api;
})(globalThis);
