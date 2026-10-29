/* Supabase public browser configuration. No service_role or OAuth client secret belongs here. */
const cloud=window.LinkDeskCloud;
const SITE_URL='https://link-desk-oleg.neatsky2048.chatgpt.site/';
let db, authGeneration=0;
const cloudColumns='id,partner,offer,geo,url,status,sent,source,note,favorite,history,updated_at';
function fromCloud(row){return {...row,sent:row.sent||'',updated:row.updated_at,demo:false}}
function toCloud(row,userId){return {user_id:userId,id:row.id,partner:row.partner,offer:row.offer,geo:row.geo,url:row.url,status:row.status,sent:row.sent||null,source:row.source,note:row.note,favorite:row.favorite,history:row.history}}
function showCloudError(message){$('#cloudError').hidden=!message;$('#cloudError').textContent=message||''}
function accountUI(){
 const signed=!!cloud.user,locked=!cloud.ready||cloud.busy||cloud.loadFailed;
 $('#accountTitle').textContent=signed?'Аккаунт: '+cloud.user.email:'Гостевой режим';
 $('#accountInfo').textContent=signed?'Личная база Supabase. Локальные записи хранятся отдельно. Для актуальных данных нажмите «Обновить базу».':'Записи хранятся в этом браузере. Вход через Google открывает отдельную личную облачную базу.';
 $('#login').hidden=signed;$('#login').disabled=!cloud.ready||cloud.busy;
 for(const id of ['logout','reloadCloud','uploadLocal']){$('#'+id).hidden=!signed;$('#'+id).disabled=!cloud.ready||cloud.busy;}
 $('#uploadLocal').disabled=locked;
 $('#add').disabled=locked;$('#import').disabled=locked;
 document.querySelectorAll('#form button,#form input,#form textarea,#form select').forEach(el=>el.disabled=locked);
 document.querySelectorAll('.star').forEach(el=>el.disabled=locked);
 const notice=$('.beta-notice');notice.querySelector('strong').textContent=signed?'Работаете с личной облачной базой.':'Ваши данные хранятся только в этом браузере.';
 notice.querySelector('p').textContent=signed?'Изменения сохраняются в Supabase. При ошибке сохранения карточка остаётся открытой. Регулярно делайте экспорт.':'Очистка данных сайта может удалить базу. Регулярно сохраняйте экспорт. Для доступа с других устройств войдите в аккаунт.';
 $('.profile small').textContent=signed?'Облачная база':'Локальное хранение';
 $('.aside-bottom strong').textContent=signed?'Личная облачная база':'Ваши ссылки — у вас';
 $('.aside-bottom p').textContent=signed?'Карточки привязаны к аккаунту. Сохраняйте резервные копии.':'Данные сохраняются в этом браузере. Экспортируйте резервную копию.';
}
async function readCloud(userId){
 const all=[];
 for(let offset=0;;offset+=500){const {data,error}=await db.from('linkdesk_links').select(cloudColumns).eq('user_id',userId).order('id').range(offset,offset+499);if(error)throw error;all.push(...data);if(all.length>10000)throw Error('limit');if(data.length<500)break;}
 return validateImport({version:1,records:all.map(fromCloud)});
}
async function reloadCloud(){
 if(!cloud.user||cloud.busy)return false;
 if($('#editor').open){toast('Сначала сохраните или закройте карточку.');return false}
 const owner=cloud.user.id,generation=authGeneration;
 cloud.busy=true;accountUI();
 try{const next=await readCloud(owner);if(generation!==authGeneration)return false;records=next;cloud.loadFailed=false;showCloudError('');render();return true}
 catch{if(generation===authGeneration){cloud.loadFailed=true;showCloudError('Не удалось загрузить облачную базу. Проверьте интернет и настройки Supabase, затем нажмите «Обновить базу». Запись заблокирована, локальная база не затронута.');}return false}
 finally{if(generation===authGeneration){cloud.busy=false;accountUI();}}
}
async function persistCloud(next){
 if(!canEdit()||!cloud.user)return false;
 const owner=cloud.user.id,generation=authGeneration;
 const before=new Map(records.map(r=>[r.id,r])),after=new Map(next.map(r=>[r.id,r]));
 const changes=next.filter(r=>JSON.stringify(r)!==JSON.stringify(before.get(r.id))),removed=records.filter(r=>!after.has(r.id));
 if(changes.length+removed.length!==1){toast('Для загрузки нескольких карточек используйте импорт.');return false}
 cloud.busy=true;accountUI();
 try{
  let result;
  if(removed.length){const r=removed[0];result=await db.from('linkdesk_links').delete().eq('user_id',owner).eq('id',r.id).eq('updated_at',r.updated).select(cloudColumns);}
  else {const r=changes[0],old=before.get(r.id);result=old?await db.from('linkdesk_links').update(toCloud(r,owner)).eq('user_id',owner).eq('id',r.id).eq('updated_at',old.updated).select(cloudColumns):await db.from('linkdesk_links').insert(toCloud(r,owner)).select(cloudColumns);}
  if(result.error)throw result.error;
  if(!result.data||result.data.length!==1)throw Error('conflict');
  if(generation!==authGeneration)return false;
  records=removed.length?records.filter(r=>r.id!==removed[0].id):[...records.filter(r=>r.id!==changes[0].id),...validateImport({version:1,records:result.data.map(fromCloud)})];
  render();showCloudError('');return true;
 }catch(error){showCloudError(error.message==='conflict'?'Карточка изменена на другом устройстве. Скопируйте несохранённые поля, закройте карточку и обновите базу.':'Сохранение не подтверждено. Проверьте интернет. Скопируйте несохранённые поля и обновите базу перед повторной попыткой.');toast('Изменения не подтверждены. Карточка не закрыта.');return false}
 finally{if(generation===authGeneration){cloud.busy=false;accountUI();}}
}
async function mergeCloud(input){
 if(!canEdit()||!cloud.user)return;
 const incoming=validateImport({version:1,records:input}).filter(r=>!r.demo);
 if(!incoming.length){toast('Нет пользовательских карточек для переноса.');return}
 if(!confirm(`Добавить до ${incoming.length} карточек в облако? Совпадающие ID будут пропущены. Существующие облачные и локальные записи не удаляются.`))return;
 const owner=cloud.user.id,generation=authGeneration;
 cloud.busy=true;accountUI();
 try{
  const {error}=await db.from('linkdesk_links').upsert(incoming.map(r=>toCloud(r,owner)),{onConflict:'user_id,id',ignoreDuplicates:true});
  if(error)throw error;
  const updated=await readCloud(owner);
  if(generation!==authGeneration)return;
  records=updated;render();showCloudError('');toast('Перенос выполнен. Локальная база сохранена.');
 }catch{showCloudError('Перенос не подтверждён. Обновите базу для проверки. Повторный перенос пропустит уже добавленные ID.');}
 finally{if(generation===authGeneration){cloud.busy=false;accountUI();}}
}
async function applySession(session){
 if(cloud.ready&&cloud.user?.id===session?.user?.id)return;
 authGeneration++;cloud.user=session?.user||null;cloud.ready=true;cloud.busy=false;cloud.loadFailed=false;
 if($('#editor').open)$('#editor').close();if($('#messageDialog').open)$('#messageDialog').close();$('#messageText').value='';$('#form').reset();$('#history').innerHTML='';
 showCloudError('');
 if(cloud.user){records=[];storageBroken=false;$('#storageError').hidden=true;render();accountUI();await reloadCloud();}
 else {try{const raw=localStorage.getItem(KEY);records=raw?validateImport({version:1,records:JSON.parse(raw)}):structuredClone(demo);storageBroken=false;}catch{records=[];storageBroken=true;}$('#storageError').hidden=!storageBroken;render();accountUI();}
}
$('#login').onclick=async()=>{
 if(!cloud.ready||cloud.busy)return;
 if(location.origin!==new URL(SITE_URL).origin){toast('Вход доступен на публичном сайте Link Desk.');return}
 cloud.busy=true;accountUI();
 try{const {error}=await db.auth.signInWithOAuth({provider:'google',options:{redirectTo:SITE_URL}});if(error)throw error;}
 catch{cloud.busy=false;accountUI();showCloudError('Не удалось начать вход Google. Проверьте интернет и попробуйте снова.');}
};
$('#logout').onclick=async()=>{
 if(cloud.busy)return;
 if($('#editor').open&&!confirm('Выйти без сохранения открытой карточки?'))return;
 cloud.busy=true;accountUI();
 try{const {error}=await db.auth.signOut({scope:'local'});if(error)throw error;await applySession(null);}
 catch{cloud.busy=false;accountUI();showCloudError('Не удалось завершить выход. Попробуйте снова.');}
};
$('#reloadCloud').onclick=reloadCloud;
$('#uploadLocal').onclick=async()=>{try{const raw=localStorage.getItem(KEY);if(!raw){toast('В этом браузере нет сохранённых локальных записей.');return}await mergeCloud(validateImport({version:1,records:JSON.parse(raw)}));}catch{toast('Локальная база повреждена. Выйдите и сохраните исходные данные.')}};
async function initCloud(){
 try{
  if(!window.supabase)throw Error('sdk');
  db=window.supabase.createClient('https://tiuhiaczdftuyxsweulj.supabase.co','sb_publishable_REndLECwI-rR6zYENhiNLg_TeN-Sauk',{auth:{flowType:'pkce',detectSessionInUrl:true,persistSession:true,autoRefreshToken:true}});
  const {data,error}=await db.auth.getSession();if(error)throw error;
  await applySession(data.session);
  db.auth.onAuthStateChange((event,session)=>{if(['SIGNED_IN','SIGNED_OUT','USER_UPDATED'].includes(event))setTimeout(()=>applySession(session),0);});
  const url=new URL(location.href);if(url.searchParams.has('error')||url.hash.includes('error=')){showCloudError('Google не завершил вход. Проверьте тестовый доступ и повторите попытку.');}
  for(const key of ['code','error','error_code','error_description'])url.searchParams.delete(key);
  if(url.hash.includes('error='))url.hash='';history.replaceState(null,'',url.pathname+url.search+url.hash);
 }catch{cloud.ready=true;cloud.user=null;cloud.busy=false;accountUI();$('#login').disabled=true;showCloudError('Авторизация недоступна. Гостевые записи работают локально. Обновите страницу, чтобы повторить подключение.');}
}
accountUI();initCloud();
