const fields = ["characterName","playerName","age","concept","corpo","instinto","razao","determinacao","influencia","connection","condition","discoveries","history","notes"];
const status = document.getElementById("saveStatus");
const storageKey = "ecos-ficha-preview-v1";
function loadDraft(){
  try{
    const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
    for(const id of fields){
      const el = document.getElementById(id);
      if(el && saved[id] !== undefined) el.value = saved[id];
    }
  }catch(_){ status.textContent = "Não foi possível carregar o rascunho local."; }
}
function saveDraft(){
  try{
    const data = {};
    for(const id of fields) data[id] = document.getElementById(id)?.value ?? "";
    localStorage.setItem(storageKey, JSON.stringify(data));
    status.textContent = "Rascunho salvo neste navegador · não está online ainda";
  }catch(_){ status.textContent = "O navegador não permitiu salvar o rascunho."; }
}
loadDraft();
for(const id of fields){
  const el = document.getElementById(id);
  el?.addEventListener("input", saveDraft);
  el?.addEventListener("change", saveDraft);
}
document.getElementById("rollButton").addEventListener("click",()=>{
  const roll = Math.floor(Math.random()*20)+1;
  const selected = document.getElementById("rollAttribute").value;
  const bonus = selected === "0" ? 0 : Number(document.getElementById(selected).value || 0);
  const total = roll + bonus;
  document.getElementById("dieResult").textContent = roll;
  const natural = roll === 20 ? " · 20 natural!" : roll === 1 ? " · 1 natural!" : "";
  const attrName = selected === "0" ? "sem atributo" : document.querySelector('label.attribute input#'+selected)?.closest(".attribute")?.querySelector(".attribute-name")?.childNodes[0]?.textContent?.trim() || selected;
  document.getElementById("rollMessage").textContent = `Resultado: ${roll} + ${bonus} (${attrName}) = ${total}${natural}`;
});
document.getElementById("resetButton").addEventListener("click",()=>{
  if(!confirm("Limpar todos os campos desta ficha neste navegador?")) return;
  for(const id of fields){
    const el = document.getElementById(id);
    if(!el) continue;
    if(el.tagName === "SELECT") el.selectedIndex = 0;
    else if(el.type === "number") el.value = id === "age" ? "" : "1";
    else el.value = "";
  }
  document.getElementById("dieResult").textContent = "20";
  document.getElementById("rollMessage").textContent = "Quando estiver pronto, lance os dados.";
  saveDraft();
});
