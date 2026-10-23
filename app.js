// Configuração pública do Supabase. A chave publishable pode ficar no navegador;
 // a segurança depende das políticas RLS configuradas no banco.
const SUPABASE_URL = "https://igadvllwyodtphohtssh.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable__b5Aimm0Cb2qJMuU_0l9vQ_LT_7Pxoj";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const fields = ["characterName","playerName","age","concept","corpo","instinto","razao","determinacao","influencia","connection","condition","discoveries","history","notes"];
const fieldToColumn = {
  characterName:"character_name", playerName:"player_name", age:"age", concept:"concept",
  corpo:"corpo", instinto:"instinto", razao:"razao", determinacao:"determinacao",
  influencia:"influencia", connection:"connection", condition:"condition",
  discoveries:"discoveries", history:"history", notes:"notes"
};
const status = document.getElementById("saveStatus");
const authPanel = document.getElementById("authPanel");
const accountPanel = document.getElementById("accountPanel");
const authMessage = document.getElementById("authMessage");
const storageKey = "ecos-ficha-preview-v1";
let currentUser = null;
let isGM = false;
let currentCharacterId = null;
let saveTimer = null;
let loadingCharacter = false;
let secrets = [];

function setAuthMessage(message){ authMessage.textContent = message; }
function localData(){
  const data = {};
  for(const id of fields) data[id] = document.getElementById(id)?.value ?? "";
  return data;
}
function applyData(data){
  loadingCharacter = true;
  for(const id of fields){
    const el = document.getElementById(id);
    const column = fieldToColumn[id];
    if(el && data[column] !== undefined && data[column] !== null) el.value = data[column];
    else if(el && data[id] !== undefined) el.value = data[id];
  }
  loadingCharacter = false;
}
function clearCharacterForm(){
  loadingCharacter = true;
  for(const id of fields){
    const el = document.getElementById(id);
    if(!el) continue;
    if(id === "age" || ["characterName","playerName","concept","condition","discoveries","history","notes"].includes(id)) el.value = "";
    else if(id === "connection") el.value = "0";
    else el.value = "1";
  }
  loadingCharacter = false;
}
function setPickerOptions(rows){
  const picker = document.getElementById("characterPicker");
  picker.replaceChildren(new Option("Nova ficha",""));
  rows.forEach(row => picker.add(new Option(row.character_name || "Ficha sem nome", row.id)));
}
async function loadCharacters(selectId = null){
  const query = db.from("characters").select("*").order("updated_at", {ascending:false});
  const {data,error} = await query;
  if(error){ status.textContent = "Não foi possível carregar as fichas: " + error.message; return; }
  setPickerOptions(data || []);
  if(selectId && (data || []).some(row => row.id === selectId)){
    document.getElementById("characterPicker").value = selectId;
    await openCharacter(selectId);
  }else if(data && data.length){
    document.getElementById("characterPicker").value = data[0].id;
    await openCharacter(data[0].id);
  }else{
    currentCharacterId = null;
    clearCharacterForm();
    status.textContent = "Nova ficha · preencha os campos e aguarde o salvamento online.";
  }
}
async function openCharacter(id){
  if(!id){
    currentCharacterId = null;
    clearCharacterForm();
    status.textContent = "Nova ficha · preencha os campos e aguarde o salvamento online.";
    if(isGM) await loadSecrets(null);
    return;
  }
  const {data,error} = await db.from("characters").select("*").eq("id",id).single();
  if(error){ status.textContent = "Não foi possível abrir a ficha: " + error.message; return; }
  currentCharacterId = data.id;
  applyData(data);
  status.textContent = "Ficha carregada online.";
  if(isGM) await loadSecrets(data.id);
}
async function saveCharacter(){
  if(!currentUser || loadingCharacter) return;
  const payload = {};
  for(const id of fields){
    const column = fieldToColumn[id];
    let value = document.getElementById(id).value;
    if(id === "age") value = value === "" ? null : Number(value);
    if(["corpo","instinto","razao","determinacao","influencia","connection"].includes(id)) value = value === "" ? 0 : Number(value);
    payload[column] = value;
  }
  payload.user_id = currentUser.id;
  status.textContent = "Salvando online…";
  let result;
  if(currentCharacterId){
    result = await db.from("characters").update(payload).eq("id",currentCharacterId).select("id").single();
  }else{
    result = await db.from("characters").insert(payload).select("id").single();
  }
  if(result.error){
    status.textContent = "Erro ao salvar online: " + result.error.message;
    return;
  }
  currentCharacterId = result.data.id;
  const picker = document.getElementById("characterPicker");
  const existing = [...picker.options].some(option => option.value === currentCharacterId);
  if(!existing) picker.add(new Option(payload.character_name || "Ficha sem nome", currentCharacterId));
  picker.value = currentCharacterId;
  status.textContent = "Ficha salva online.";
}
function queueSave(){
  if(loadingCharacter) return;
  try{ localStorage.setItem(storageKey, JSON.stringify(localData())); }catch(_){}
  if(!currentUser){
    status.textContent = "Rascunho salvo neste navegador · entre para salvar online.";
    return;
  }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveCharacter, 800);
}
async function refreshSession(session){
  currentUser = session?.user || null;
  if(!currentUser){
    isGM = false;
    authPanel.hidden = false;
    accountPanel.hidden = true;
    document.getElementById("gmPanel").hidden = true;
    setAuthMessage("Você ainda não está conectado.");
    status.textContent = "Prévia local · entre para salvar fichas online.";
    return;
  }
  authPanel.hidden = true;
  accountPanel.hidden = false;
  document.getElementById("accountLabel").textContent = currentUser.email || "Conta conectada";
  const {data:profile,error} = await db.from("profiles").select("role, display_name").eq("id",currentUser.id).single();
  isGM = !error && profile?.role === "gm";
  document.getElementById("roleLabel").textContent = isGM ? "Acesso: Mestre (GM)" : "Acesso: Jogador";
  document.getElementById("gmPanel").hidden = !isGM;
  await loadCharacters();
}
document.getElementById("signupButton").addEventListener("click", async()=>{
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  if(!email || password.length < 6){ setAuthMessage("Informe um e-mail e uma senha com pelo menos 6 caracteres."); return; }
  setAuthMessage("Criando conta…");
  const {data,error} = await db.auth.signUp({email,password});
  if(error){ setAuthMessage("Não foi possível criar a conta: " + error.message); return; }
  if(data.session) await refreshSession(data.session);
  else setAuthMessage("Conta criada! Confira seu e-mail para confirmar o cadastro e depois entre.");
});
document.getElementById("loginButton").addEventListener("click", async()=>{
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  if(!email || !password){ setAuthMessage("Preencha e-mail e senha."); return; }
  setAuthMessage("Entrando…");
  const {data,error} = await db.auth.signInWithPassword({email,password});
  if(error){ setAuthMessage("Não foi possível entrar: " + error.message); return; }
  await refreshSession(data.session);
});
document.getElementById("logoutButton").addEventListener("click", async()=>{
  const {error} = await db.auth.signOut();
  if(error) setAuthMessage("Erro ao sair: " + error.message);
  else { currentUser = null; await refreshSession(null); }
});
document.getElementById("characterPicker").addEventListener("change", e=>openCharacter(e.target.value));
for(const id of fields){
  const el = document.getElementById(id);
  el?.addEventListener("input", queueSave);
  el?.addEventListener("change", queueSave);
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
document.getElementById("resetButton").addEventListener("click",async()=>{
  if(!confirm("Limpar todos os campos desta ficha?")) return;
  clearCharacterForm();
  document.getElementById("dieResult").textContent = "20";
  document.getElementById("rollMessage").textContent = "Quando estiver pronto, lance os dados.";
  if(currentUser) await saveCharacter();
  else queueSave();
});

async function loadSecrets(characterId, selectSecretId = null){
  const picker = document.getElementById("secretPicker");
  picker.replaceChildren(new Option("Novo segredo",""));
  secrets = [];
  if(!characterId) return;
  const {data,error} = await db.from("gm_secrets").select("*").eq("character_id",characterId).order("created_at",{ascending:false});
  if(error){ document.getElementById("secretMessage").textContent = "Não foi possível carregar segredos: " + error.message; return; }
  secrets = data || [];
  secrets.forEach(secret=>picker.add(new Option(secret.title || "Segredo sem título",secret.id)));
  if(selectSecretId) picker.value = selectSecretId;
  else picker.value = "";
  showSelectedSecret(picker.value);
}
function showSelectedSecret(id){
  const secret = secrets.find(item=>item.id === id);
  document.getElementById("secretTitle").value = secret?.title || "";
  document.getElementById("secretContent").value = secret?.content || "";
}
document.getElementById("secretPicker").addEventListener("change",e=>showSelectedSecret(e.target.value));
document.getElementById("clearSecretButton").addEventListener("click",()=>{
  document.getElementById("secretPicker").value = "";
  showSelectedSecret("");
});
document.getElementById("saveSecretButton").addEventListener("click",async()=>{
  if(!isGM){ document.getElementById("secretMessage").textContent = "Somente o mestre pode salvar segredos."; return; }
  if(!currentCharacterId){ document.getElementById("secretMessage").textContent = "Salve primeiro a ficha do personagem."; return; }
  const id = document.getElementById("secretPicker").value;
  const payload = {character_id:currentCharacterId,title:document.getElementById("secretTitle").value.trim(),content:document.getElementById("secretContent").value};
  if(!payload.title){ document.getElementById("secretMessage").textContent = "Informe um título para o segredo."; return; }
  const result = id
    ? await db.from("gm_secrets").update(payload).eq("id",id).select("*").single()
    : await db.from("gm_secrets").insert(payload).select("*").single();
  if(result.error){ document.getElementById("secretMessage").textContent = "Erro ao salvar segredo: " + result.error.message; return; }
  document.getElementById("secretMessage").textContent = "Segredo salvo com segurança no banco.";
  await loadSecrets(currentCharacterId,result.data.id);
});

(async()=>{
  const {data:{session}} = await db.auth.getSession();
  await refreshSession(session);
  db.auth.onAuthStateChange((_event,session)=>{ setTimeout(()=>refreshSession(session),0); });
})();
