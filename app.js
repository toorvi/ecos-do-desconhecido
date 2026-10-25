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
const libraryPanel = document.getElementById("libraryPanel");
const characterSheet = document.getElementById("characterSheet");
const authMessage = document.getElementById("authMessage");
const storageKey = "ecos-ficha-preview-v1";
let currentUser = null;
let isGM = false;
let currentCharacterId = null;
let currentImagePath = null;
let saveTimer = null;
let loadingCharacter = false;
let secrets = [];

function setAuthMessage(message){ authMessage.textContent = message; }

function setCharacterPhoto(path){
  currentImagePath = path;
  const img = document.getElementById("characterPhotoPreview");
  const placeholder = document.getElementById("characterPhotoPlaceholder");
  if(path){
    const {data} = db.storage.from("character-photos").getPublicUrl(path);
    img.src = data.publicUrl;
    img.hidden = false;
    placeholder.hidden = true;
  }else{
    img.removeAttribute("src");
    img.hidden = true;
    placeholder.hidden = false;
  }
}
document.getElementById("characterPhotoInput").addEventListener("change", async event=>{
  const file = event.target.files?.[0];
  const message = document.getElementById("photoMessage");
  if(!file) return;
  if(!currentUser){ message.textContent = "Entre na sua conta para enviar uma foto."; event.target.value = ""; return; }
  if(!currentCharacterId){ message.textContent = "Preencha e salve a ficha primeiro, depois envie a foto."; event.target.value = ""; return; }
  if(!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size > 5*1024*1024){
    message.textContent = "Escolha JPG, PNG ou WebP com até 5 MB."; event.target.value = ""; return;
  }
  message.textContent = "Enviando foto…";
  const path = `${currentUser.id}/${currentCharacterId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
  const {error:uploadError} = await db.storage.from("character-photos").upload(path,file,{upsert:true,contentType:file.type});
  if(uploadError){ message.textContent = "Não foi possível enviar: " + uploadError.message; return; }
  const {error:updateError} = await db.from("characters").update({image_path:path}).eq("id",currentCharacterId);
  if(updateError){ message.textContent = "Foto enviada, mas não foi vinculada à ficha: " + updateError.message; return; }
  setCharacterPhoto(path);
  message.textContent = "Foto salva na ficha.";
  event.target.value = "";
});
document.getElementById("removeCharacterPhoto").addEventListener("click", async()=>{
  const message = document.getElementById("photoMessage");
  if(!currentImagePath){ message.textContent = "Esta ficha não tem foto."; return; }
  if(!currentUser || !currentCharacterId){ message.textContent = "Entre e selecione uma ficha salva."; return; }
  const oldPath = currentImagePath;
  const {error} = await db.from("characters").update({image_path:null}).eq("id",currentCharacterId);
  if(error){ message.textContent = "Não foi possível remover a foto: " + error.message; return; }
  setCharacterPhoto(null);
  message.textContent = "Foto removida da ficha.";
  await db.storage.from("character-photos").remove([oldPath]);
});

function selectedArchetypes(){ return [...document.querySelectorAll("input[name=archetypes]:checked")].map(input=>input.value); }
function setArchetypes(values){ const selected = Array.isArray(values) ? values : []; document.querySelectorAll("input[name=archetypes]").forEach(input=>{ input.checked = selected.includes(input.value); }); }
function localData(){
  const data = {};
  for(const id of fields) data[id] = document.getElementById(id)?.value ?? "";
  data.archetypes = selectedArchetypes();
  return data;
}
function applyData(data){
  setCharacterPhoto(data.image_path || null);
  loadingCharacter = true;
  setArchetypes(data.archetypes || []);
  for(const id of fields){
    const el = document.getElementById(id);
    const column = fieldToColumn[id];
    if(el && data[column] !== undefined && data[column] !== null) el.value = data[column];
    else if(el && data[id] !== undefined) el.value = data[id];
  }
  loadingCharacter = false;
}
function clearCharacterForm(){
  setCharacterPhoto(null);
  loadingCharacter = true;
  setArchetypes([]);
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
  picker.replaceChildren(new Option("Selecione uma ficha",""));
  rows.forEach(row => picker.add(new Option(row.character_name || "Ficha sem nome", row.id)));
}
function showLibrary(){
  libraryPanel.hidden = false;
  characterSheet.hidden = true;
  accountPanel.hidden = true;
}
function showCharacterSheet(){
  libraryPanel.hidden = true;
  characterSheet.hidden = false;
  accountPanel.hidden = true;
}
function renderCharacterCards(rows){
  const container = document.getElementById("characterCards");
  container.replaceChildren();
  if(!rows.length){
    const empty = document.createElement("div");
    empty.className = "empty-library";
    empty.innerHTML = "<span>◉</span><h3>Nenhuma ficha encontrada</h3><p>Seu arquivo ainda está vazio. Crie seu primeiro personagem para começar.</p>";
    container.append(empty);
    document.getElementById("librarySubtitle").textContent = "Você ainda não tem personagens salvos.";
    return;
  }
  document.getElementById("librarySubtitle").textContent = `${rows.length} ${rows.length === 1 ? "personagem salvo" : "personagens salvos"} no seu arquivo.`;
  rows.forEach(row=>{
    const card = document.createElement("button");
    card.type = "button";
    card.className = "character-card";
    card.addEventListener("click", async()=>{ await openCharacter(row.id); showCharacterSheet(); });
    const portrait = document.createElement("div");
    portrait.className = "character-card-portrait";
    if(row.image_path){
      const {data} = db.storage.from("character-photos").getPublicUrl(row.image_path);
      const img = document.createElement("img");
      img.src = data.publicUrl;
      img.alt = "";
      portrait.append(img);
    }else{
      portrait.textContent = "◉";
    }
    const details = document.createElement("div");
    details.className = "character-card-details";
    const name = document.createElement("strong");
    name.textContent = row.character_name || "Personagem sem nome";
    const concept = document.createElement("span");
    concept.textContent = row.concept || "Conceito ainda não definido";
    const player = document.createElement("small");
    player.textContent = row.player_name || "Jogador não informado";
    details.append(name,concept,player);
    card.append(portrait,details);
    container.append(card);
  });
}
async function loadCharacters(selectId = null){
  const {data,error} = await db.from("characters").select("*").order("updated_at", {ascending:false});
  if(error){ status.textContent = "Não foi possível carregar as fichas: " + error.message; return; }
  const rows = data || [];
  setPickerOptions(rows);
  renderCharacterCards(rows);
  if(selectId && rows.some(row=>row.id===selectId)){
    document.getElementById("characterPicker").value = selectId;
    await openCharacter(selectId);
    showCharacterSheet();
  }else{
    currentCharacterId = null;
    clearCharacterForm();
    showLibrary();
    status.textContent = rows.length ? "Escolha uma ficha para abrir." : "Crie seu primeiro personagem.";
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
  payload.image_path = currentImagePath;
  payload.archetypes = selectedArchetypes();
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
async function loadDiceRolls(){
  const list = document.getElementById("rollHistoryList");
  const message = document.getElementById("rollHistoryMessage");
  if(!currentUser){
    list.replaceChildren();
    message.textContent = "Entre para salvar e consultar seu histórico.";
    return;
  }
  message.textContent = "Carregando histórico…";
  let query = db.from("dice_rolls").select("*").order("created_at",{ascending:false}).limit(50);
  if(!isGM) query = query.eq("user_id",currentUser.id);
  const {data,error} = await query;
  if(error){
    message.textContent = "Não foi possível carregar o histórico: " + error.message;
    return;
  }
  list.replaceChildren();
  if(!data?.length){
    message.textContent = "Nenhuma rolagem registrada ainda.";
    return;
  }
  message.textContent = isGM ? "Últimas 50 rolagens de todos os jogadores." : "Suas últimas 50 rolagens.";
  for(const item of data){
    const row = document.createElement("article");
    row.className = "roll-history-item";
    const main = document.createElement("div");
    main.className = "roll-history-main";
    const title = document.createElement("strong");
    title.textContent = item.character_name || "Ficha sem nome";
    const detail = document.createElement("span");
    detail.textContent = `d20: ${item.roll_value} · ${item.attribute} ${item.bonus >= 0 ? "+" : ""}${item.bonus} = ${item.total}`;
    main.append(title,detail);
    const date = document.createElement("time");
    date.dateTime = item.created_at;
    date.textContent = new Date(item.created_at).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"});
    row.append(main,date);
    list.append(row);
  }
}
async function refreshSession(session){
  currentUser = session?.user || null;
  if(!currentUser){
    isGM = false;
    authPanel.hidden = false;
    accountPanel.hidden = true;
    libraryPanel.hidden = true;
    characterSheet.hidden = true;
    document.getElementById("gmPanel").hidden = true;
    setAuthMessage("Você ainda não está conectado.");
    status.textContent = "Prévia local · entre para salvar fichas online.";
    return;
  }
  authPanel.hidden = true;
  accountPanel.hidden = true;
  libraryPanel.hidden = false;
  characterSheet.hidden = true;
  document.getElementById("accountLabel").textContent = currentUser.email || "Conta conectada";
  const {data:profile,error} = await db.from("profiles").select("role, display_name").eq("id",currentUser.id).single();
  isGM = !error && profile?.role === "gm";
  document.getElementById("roleLabel").textContent = isGM ? "Acesso: Mestre (GM)" : "Acesso: Jogador";
  document.getElementById("gmPanel").hidden = !isGM;
  await loadCharacters();
  await loadDiceRolls();
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
document.getElementById("forgotPasswordButton").addEventListener("click", async()=>{
  const email = document.getElementById("authEmail").value.trim();
  if(!email){ setAuthMessage("Digite seu e-mail no campo acima antes de pedir a recuperação."); return; }
  setAuthMessage("Enviando link de recuperação…");
  const {error} = await db.auth.resetPasswordForEmail(email, {
    redirectTo: "https://ecos-do-desconhecido.vercel.app/"
  });
  if(error){ setAuthMessage("Não foi possível enviar o link: " + error.message); return; }
  setAuthMessage("Se esse e-mail estiver cadastrado, você receberá um link de recuperação. Confira também o spam.");
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
document.getElementById("characterPicker").addEventListener("change", async e=>{ if(e.target.value){ await openCharacter(e.target.value); showCharacterSheet(); } });
document.getElementById("createCharacterButton").addEventListener("click",()=>{ currentCharacterId=null; clearCharacterForm(); document.getElementById("characterPicker").value=""; showCharacterSheet(); status.textContent="Nova ficha · preencha os campos para salvar online."; });
document.getElementById("backToLibraryButton").addEventListener("click",async()=>{ await loadCharacters(currentCharacterId); showLibrary(); });
document.getElementById("libraryLogoutButton").addEventListener("click",async()=>{ const {error}=await db.auth.signOut(); if(error) setAuthMessage("Erro ao sair: "+error.message); else await refreshSession(null); });
for(const id of fields){
  const el = document.getElementById(id);
  el?.addEventListener("input", queueSave);
  el?.addEventListener("change", queueSave);
}
document.querySelectorAll("input[name=archetypes]").forEach(el=>el.addEventListener("change",queueSave));
document.getElementById("rollButton").addEventListener("click", async()=>{
  const roll = Math.floor(Math.random()*20)+1;
  const selected = document.getElementById("rollAttribute").value;
  const bonus = selected === "0" ? 0 : Number(document.getElementById(selected).value || 0);
  const total = roll + bonus;
  document.getElementById("dieResult").textContent = roll;
  const natural = roll === 20 ? " · 20 natural!" : roll === 1 ? " · 1 natural!" : "";
  const attrName = selected === "0" ? "sem atributo" : document.querySelector('label.attribute input#'+selected)?.closest(".attribute")?.querySelector(".attribute-name")?.childNodes[0]?.textContent?.trim() || selected;
  document.getElementById("rollMessage").textContent = `Resultado: ${roll} + ${bonus} (${attrName}) = ${total}${natural}`;
  if(!currentUser){
    document.getElementById("rollHistoryMessage").textContent = "Entre na sua conta para salvar esta rolagem no histórico.";
    return;
  }
  const payload = {
    user_id: currentUser.id,
    character_id: currentCharacterId,
    character_name: document.getElementById("characterName").value.trim() || "Ficha sem nome",
    roll_value: roll,
    attribute: attrName,
    bonus,
    total
  };
  const {error} = await db.from("dice_rolls").insert(payload);
  if(error){
    document.getElementById("rollHistoryMessage").textContent = "Rolagem feita, mas não foi salva: " + error.message;
    return;
  }
  document.getElementById("rollHistoryMessage").textContent = "Rolagem salva no histórico.";
  await loadDiceRolls();
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

document.getElementById("updatePasswordButton").addEventListener("click", async()=>{
  const password = document.getElementById("newPassword").value;
  const message = document.getElementById("resetPasswordMessage");
  if(password.length < 6){ message.textContent = "A nova senha precisa ter pelo menos 6 caracteres."; return; }
  message.textContent = "Salvando nova senha…";
  const {error} = await db.auth.updateUser({password});
  if(error){ message.textContent = "Não foi possível trocar a senha: " + error.message; return; }
  message.textContent = "Senha alterada! Você já pode entrar com a nova senha.";
  document.getElementById("newPassword").value = "";
  history.replaceState(null, "", window.location.pathname);
  document.getElementById("resetPasswordPanel").hidden = true;
  document.getElementById("authPanel").hidden = false;
});

(async()=>{
  const isRecovery = window.location.hash.includes("type=recovery");
  if(isRecovery){
    authPanel.hidden = true;
    accountPanel.hidden = true;
    libraryPanel.hidden = true;
    characterSheet.hidden = true;
    document.getElementById("gmPanel").hidden = true;
    document.getElementById("resetPasswordPanel").hidden = false;
    setAuthMessage("Defina uma nova senha para continuar.");
  }
  const {data:{session}} = await db.auth.getSession();
  if(!isRecovery) await refreshSession(session);
  db.auth.onAuthStateChange((event,session)=>{
    setTimeout(()=>{
      if(event === "PASSWORD_RECOVERY"){
        authPanel.hidden = true;
        accountPanel.hidden = true;
        document.getElementById("resetPasswordPanel").hidden = false;
      } else if(!window.location.hash.includes("type=recovery")) {
        refreshSession(session);
      }
    },0);
  });
})();
