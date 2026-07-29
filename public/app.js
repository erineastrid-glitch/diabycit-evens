const APP = document.getElementById('app');
let state = {
  token: localStorage.getItem('diabycit_token') || null,
  user: null,
  view: 'loading',
  activeTab: 'dashboard',
  onboardStep: 1,
  onboardData: {},
  error: null,
};

function setState(patch) { state = { ...state, ...patch }; render(); }

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) throw new Error(data.error || 'Erreur');
  return data;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------------- BOOT ----------------
async function boot() {
  try {
    const status = await api('/api/onboarding/status');
    if (status.needsOnboarding) return setState({ view: 'onboarding' });
    if (state.token) {
      try {
        const me = await api('/api/auth/me');
        return setState({ view: 'app', user: me.user });
      } catch (e) {
        localStorage.removeItem('diabycit_token');
        setState({ token: null });
      }
    }
    setState({ view: 'login' });
  } catch (e) {
    setState({ view: 'login', error: 'Impossible de contacter le serveur.' });
  }
}

// ---------------- ONBOARDING ----------------
function renderOnboarding() {
  const step = state.onboardStep;
  const d = state.onboardData;
  let inner = '';

  if (step === 1) {
    inner = `
      <h1>Bienvenue</h1>
      <p class="lead">Configurons DIABYCIT EVEN'S. Ce court assistant crée votre compte administrateur principal.</p>
      <div class="btn-row"><button class="btn btn-primary" id="next">Commencer</button></div>`;
  } else if (step === 2) {
    inner = `
      <h1>Votre identité</h1>
      <p class="lead">Nom, prénom et téléphone de l'administrateur.</p>
      <label>Prénom</label><input id="prenom" value="${d.prenom || ''}" />
      <label>Nom</label><input id="nom" value="${d.nom || ''}" />
      <label>Téléphone</label><input id="telephone" value="${d.telephone || ''}" />
      <div class="btn-row"><button class="btn btn-secondary" id="back">Retour</button><button class="btn btn-primary" id="next">Continuer</button></div>`;
  } else if (step === 3) {
    inner = `
      <h1>Email</h1>
      <p class="lead">Votre adresse de messagerie professionnelle.</p>
      <label>Email</label><input id="email" type="email" value="${d.email || ''}" />
      <div class="btn-row"><button class="btn btn-secondary" id="back">Retour</button><button class="btn btn-primary" id="next">Continuer</button></div>`;
  } else if (step === 4) {
    inner = `
      <h1>Mot de passe</h1>
      <p class="lead">Choisissez un mot de passe sécurisé.</p>
      <label>Mot de passe</label>
      <div class="pw-wrap"><input id="password" type="password" value="${d.password || ''}" /><button id="toggle-pw" type="button">👁</button></div>
      <div class="btn-row"><button class="btn btn-secondary" id="back">Retour</button><button class="btn btn-primary" id="finish">Créer le compte</button></div>`;
  } else if (step === 5) {
    inner = `
      <h1>C'est prêt 🎉</h1>
      <p class="lead">Votre compte Super-Admin a été créé avec succès.</p>
      <div class="btn-row"><button class="btn btn-primary" id="enter">Entrer dans l'application</button></div>`;
  }

  APP.innerHTML = `
    <div class="centered-screen"><div class="panel">
      <div class="step-indicator">${[1,2,3,4,5].map(i => `<span class="${i <= step ? 'active' : ''}"></span>`).join('')}</div>
      ${inner}
      ${state.error ? `<div class="error-msg">${state.error}</div>` : ''}
    </div></div>`;

  const next = document.getElementById('next');
  const back = document.getElementById('back');
  const finish = document.getElementById('finish');
  const enter = document.getElementById('enter');
  const togglePw = document.getElementById('toggle-pw');

  if (togglePw) togglePw.onclick = () => {
    const inp = document.getElementById('password');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  };

  if (back) back.onclick = () => setState({ onboardStep: step - 1, error: null });

  if (next) next.onclick = () => {
    if (step === 2) {
      const prenom = document.getElementById('prenom').value.trim();
      const nom = document.getElementById('nom').value.trim();
      const telephone = document.getElementById('telephone').value.trim();
      if (!prenom || !nom) return setState({ error: 'Merci de renseigner nom et prénom.' });
      return setState({ onboardData: { ...d, prenom, nom, telephone }, onboardStep: 3, error: null });
    }
    if (step === 3) {
      const email = document.getElementById('email').value.trim();
      if (!email.includes('@')) return setState({ error: 'Email invalide.' });
      return setState({ onboardData: { ...d, email }, onboardStep: 4, error: null });
    }
    setState({ onboardStep: step + 1, error: null });
  };

  if (finish) finish.onclick = async () => {
    const password = document.getElementById('password').value;
    if (!password || password.length < 6) return setState({ error: 'Le mot de passe doit contenir au moins 6 caractères.' });
    try {
      const result = await api('/api/onboarding', { method: 'POST', body: { ...d, password } });
      localStorage.setItem('diabycit_token', result.token);
      setState({ token: result.token, user: result.user, onboardStep: 5, error: null });
    } catch (e) { setState({ error: e.message }); }
  };

  if (enter) enter.onclick = () => setState({ view: 'app' });
}

// ---------------- LOGIN / REGISTER ----------------
function renderLogin() {
  APP.innerHTML = `
    <div class="centered-screen"><div class="panel">
      <h1>DIABYCIT EVEN'S</h1>
      <p class="lead">Connectez-vous pour accéder à votre espace.</p>
      <label>Email</label><input id="email" type="email" />
      <label>Mot de passe</label>
      <div class="pw-wrap"><input id="password" type="password" /><button id="toggle-pw" type="button">👁</button></div>
      <div class="btn-row"><button class="btn btn-primary" id="login-btn" style="flex:1">Se connecter</button></div>
      ${state.error ? `<div class="error-msg">${state.error}</div>` : ''}
      ${state.info ? `<div class="success-msg">${state.info}</div>` : ''}
      <p style="text-align:center;margin-top:18px;"><button class="link-btn" id="go-register">Créer un compte utilisateur</button></p>
    </div></div>`;

  document.getElementById('toggle-pw').onclick = () => {
    const inp = document.getElementById('password');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  };
  document.getElementById('go-register').onclick = () => setState({ view: 'register', error: null, info: null });
  document.getElementById('login-btn').onclick = async () => {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    try {
      const result = await api('/api/auth/login', { method: 'POST', body: { email, password } });
      localStorage.setItem('diabycit_token', result.token);
      setState({ token: result.token, user: result.user, view: 'app', error: null });
    } catch (e) { setState({ error: e.message }); }
  };
}

function renderRegister() {
  APP.innerHTML = `
    <div class="centered-screen"><div class="panel">
      <h1>Créer un compte</h1>
      <p class="lead">Votre demande sera soumise à validation par un administrateur.</p>
      <label>Prénom</label><input id="prenom" />
      <label>Nom</label><input id="nom" />
      <label>Téléphone</label><input id="telephone" />
      <label>Email</label><input id="email" type="email" />
      <label>Mot de passe</label>
      <div class="pw-wrap"><input id="password" type="password" /><button id="toggle-pw" type="button">👁</button></div>
      <div class="btn-row"><button class="btn btn-secondary" id="back">Retour</button><button class="btn btn-primary" id="submit">Envoyer la demande</button></div>
      ${state.error ? `<div class="error-msg">${state.error}</div>` : ''}
    </div></div>`;

  document.getElementById('toggle-pw').onclick = () => {
    const inp = document.getElementById('password');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  };
  document.getElementById('back').onclick = () => setState({ view: 'login', error: null });
  document.getElementById('submit').onclick = async () => {
    const body = {
      prenom: document.getElementById('prenom').value.trim(),
      nom: document.getElementById('nom').value.trim(),
      telephone: document.getElementById('telephone').value.trim(),
      email: document.getElementById('email').value.trim(),
      password: document.getElementById('password').value,
    };
    if (!body.prenom || !body.nom || !body.email || !body.password) return setState({ error: 'Merci de remplir tous les champs.' });
    try {
      await api('/api/auth/register', { method: 'POST', body });
      setState({ view: 'login', info: 'Compte créé. Un administrateur doit valider votre accès avant votre première connexion.', error: null });
    } catch (e) { setState({ error: e.message }); }
  };
}

// ---------------- APP SHELL ----------------
const NAV_ITEMS = [
  { id: 'dashboard', label: 'Tableau de bord' },
  { id: 'ressources', label: 'Ressources' },
  { id: 'bons', label: 'Bons de sortie' },
  { id: 'billetterie', label: 'Billetterie' },
  { id: 'mon-compte', label: 'Mon compte' },
  { id: 'utilisateurs', label: 'Utilisateurs', adminOnly: true },
  { id: 'parametres', label: 'Paramètres', adminOnly: true },
];

async function renderApp() {
  const isAdmin = state.user && (state.user.role === 'admin' || state.user.role === 'super_admin');
  let pendingCount = 0;
  if (isAdmin) {
    try { const r = await api('/api/users/pending'); pendingCount = r.users.length; } catch (e) {}
  }

  APP.innerHTML = `
    <div class="app-shell">
      <nav class="sidebar">
        <div class="brand">DIABYCIT EVEN'S</div>
        ${NAV_ITEMS.filter(i => !i.adminOnly || isAdmin).map(i => `
          <button class="nav-item ${state.activeTab === i.id ? 'active' : ''}" data-tab="${i.id}">
            ${i.label} ${i.id === 'utilisateurs' && pendingCount > 0 ? `<span class="badge">${pendingCount}</span>` : ''}
          </button>`).join('')}
        <div class="spacer"></div>
        <div class="user-box">
          <div class="name">${state.user.prenom} ${state.user.nom}</div>
          <div>${state.user.role === 'super_admin' ? 'Super-Admin' : state.user.role === 'admin' ? 'Admin' : 'Utilisateur'}</div>
          <button class="link-btn" id="logout" style="margin-top:8px;">Se déconnecter</button>
        </div>
      </nav>
      <main class="main-content" id="main-content"></main>
    </div>`;

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.onclick = () => setState({ activeTab: btn.dataset.tab });
  });
  document.getElementById('logout').onclick = async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch (e) {}
    localStorage.removeItem('diabycit_token');
    setState({ token: null, user: null, view: 'login', activeTab: 'dashboard' });
  };

  const main = document.getElementById('main-content');
  if (state.activeTab === 'dashboard') return renderDashboard(main);
  if (state.activeTab === 'ressources') return renderRessources(main);
  if (state.activeTab === 'bons') return renderBons(main);
  if (state.activeTab === 'billetterie') return renderBilletterie(main);
  if (state.activeTab === 'mon-compte') return renderMonCompte(main);
  if (state.activeTab === 'utilisateurs') return renderUtilisateurs(main);
  if (state.activeTab === 'parametres') return renderParametres(main);
}

// ---------------- DASHBOARD ----------------
async function renderDashboard(main) {
  main.innerHTML = `<h2>Tableau de bord</h2><div class="empty-hint">Chargement…</div>`;
  let stats;
  try { stats = await api('/api/stats'); } catch (e) { main.innerHTML = `<div class="error-msg">${e.message}</div>`; return; }

  const maxCat = Math.max(1, ...stats.topCategories.map(c => c.total));
  const maxMat = Math.max(1, ...stats.materielRotation.map(m => m.sorties));

  main.innerHTML = `
    <h2>Tableau de bord</h2>
    <div class="grid grid-3">
      <div class="card"><div class="card-title">Solde actuel</div><div class="kpi">${fmt(stats.soldeTotal)}</div></div>
      <div class="card"><div class="card-title">Dépenses ce mois</div><div class="kpi">${fmt(stats.depensesMois)}</div></div>
      <div class="card"><div class="card-title">Entrées ce mois</div><div class="kpi">${fmt(stats.entreesMois)}</div></div>
    </div>
    <div class="grid grid-2">
      <div class="card">
        <div class="card-title">Top catégories de dépenses</div>
        ${stats.topCategories.length ? stats.topCategories.map(c => `
          <div class="bar-row">
            <div class="label">${c.motif || '(sans motif)'}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${(c.total / maxCat) * 100}%"></div></div>
            <div class="bar-value">${fmt(c.total)}</div>
          </div>`).join('') : '<div class="empty-hint">Aucune dépense enregistrée</div>'}
      </div>
      <div class="card">
        <div class="card-title">Rotation matériel (ce mois)</div>
        ${stats.materielRotation.length ? stats.materielRotation.map(m => `
          <div class="bar-row">
            <div class="label">${m.materiel_liste || '(matériel)'}</div>
            <div class="bar-track"><div class="bar-fill" style="width:${(m.sorties / maxMat) * 100}%"></div></div>
            <div class="bar-value">${m.sorties} sortie(s)</div>
          </div>`).join('') : '<div class="empty-hint">Aucune sortie matérielle ce mois</div>'}
      </div>
    </div>
    <div class="card"><div class="card-title">Bons de sortie générés (total)</div><div class="kpi">${stats.bonsCount}</div></div>`;
}

function fmt(n) { return Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 }); }

// ---------------- RESSOURCES ----------------
async function renderRessources(main) {
  main.innerHTML = `<h2>Ressources</h2><div class="empty-hint">Chargement…</div>`;
  let comptes, materiels;
  try {
    [comptes, materiels] = await Promise.all([api('/api/comptes'), api('/api/materiels')]);
  } catch (e) { main.innerHTML = `<div class="error-msg">${e.message}</div>`; return; }
  comptes = comptes.comptes; materiels = materiels.materiels;

  main.innerHTML = `
    <h2>Ressources</h2>
    <div class="card">
      <div class="card-title">Ressources financières</div>
      <div class="form-inline">
        <div class="field"><label>Type</label><select id="c-type"><option value="bancaire">Compte bancaire</option><option value="caisse">Caisse physique</option><option value="fonds">Fonds de roulement</option></select></div>
        <div class="field"><label>Libellé</label><input id="c-libelle" placeholder="ex. Caisse principale" /></div>
        <div class="field"><label>Solde initial</label><input id="c-solde" type="number" value="0" /></div>
        <button class="btn btn-primary" id="add-compte">Ajouter</button>
      </div>
      <table>
        <thead><tr><th>Libellé</th><th>Type</th><th>Solde</th><th>Mouvement</th></tr></thead>
        <tbody>
          ${comptes.map(c => `
            <tr>
              <td>${c.libelle}</td><td>${c.type}</td><td>${fmt(c.solde)}</td>
              <td>
                <input type="number" class="mv-montant" data-id="${c.id}" placeholder="montant" style="width:90px;display:inline-block;" />
                <button class="btn btn-secondary mv-entree" data-id="${c.id}" style="padding:6px 10px;">+ Entrée</button>
                <button class="btn btn-secondary mv-sortie" data-id="${c.id}" style="padding:6px 10px;">- Sortie</button>
              </td>
            </tr>`).join('') || `<tr><td colspan="4" class="empty-hint">Aucun compte pour l'instant</td></tr>`}
        </tbody>
      </table>
    </div>

    <div class="card">
      <div class="card-title">Ressources matérielles</div>
      <div class="form-inline">
        <div class="field"><label>Nom</label><input id="m-nom" placeholder="ex. Sonorisation" /></div>
        <div class="field"><label>Catégorie</label><input id="m-categorie" placeholder="ex. Technique" /></div>
        <div class="field"><label>Quantité</label><input id="m-quantite" type="number" value="1" /></div>
        <div class="field"><label>État</label><select id="m-etat"><option value="bon">Bon</option><option value="moyen">Moyen</option><option value="a_reparer">À réparer</option></select></div>
        <div class="field"><label>Emplacement</label><input id="m-emplacement" placeholder="ex. Entrepôt A" /></div>
        <button class="btn btn-primary" id="add-materiel">Ajouter</button>
      </div>
      <table>
        <thead><tr><th>Nom</th><th>Catégorie</th><th>Qté</th><th>État</th><th>Emplacement</th></tr></thead>
        <tbody>
          ${materiels.map(m => `<tr><td>${m.nom}</td><td>${m.categorie || '-'}</td><td>${m.quantite}</td><td>${m.etat || '-'}</td><td>${m.emplacement || '-'}</td></tr>`).join('') || `<tr><td colspan="5" class="empty-hint">Aucun matériel pour l'instant</td></tr>`}
        </tbody>
      </table>
    </div>`;

  document.getElementById('add-compte').onclick = async () => {
    const type = document.getElementById('c-type').value;
    const libelle = document.getElementById('c-libelle').value.trim();
    const solde = document.getElementById('c-solde').value;
    if (!libelle) return;
    await api('/api/comptes', { method: 'POST', body: { type, libelle, solde } });
    renderRessources(main);
  };
  document.getElementById('add-materiel').onclick = async () => {
    const nom = document.getElementById('m-nom').value.trim();
    if (!nom) return;
    await api('/api/materiels', {
      method: 'POST', body: {
        nom,
        categorie: document.getElementById('m-categorie').value.trim(),
        quantite: document.getElementById('m-quantite').value,
        etat: document.getElementById('m-etat').value,
        emplacement: document.getElementById('m-emplacement').value.trim(),
      }
    });
    renderRessources(main);
  };
  document.querySelectorAll('.mv-entree, .mv-sortie').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const montantInput = document.querySelector(`.mv-montant[data-id="${id}"]`);
      const montant = montantInput.value;
      if (!montant) return;
      const type = btn.classList.contains('mv-entree') ? 'entree' : 'sortie';
      await api(`/api/comptes/${id}/mouvement`, { method: 'POST', body: { type, montant, motif: 'Saisie manuelle', date: new Date().toISOString().slice(0, 10) } });
      renderRessources(main);
    };
  });
}

// ---------------- BONS DE SORTIE ----------------
async function renderBons(main) {
  main.innerHTML = `<h2>Bons de sortie</h2><div class="empty-hint">Chargement…</div>`;
  let bons;
  try { bons = (await api('/api/bons')).bons; } catch (e) { main.innerHTML = `<div class="error-msg">${e.message}</div>`; return; }

  main.innerHTML = `
    <h2>Bons de sortie</h2>
    <div class="card">
      <div class="card-title">Nouveau bon de sortie</div>
      <div class="form-inline">
        <div class="field"><label>Date</label><input id="b-date" type="date" value="${new Date().toISOString().slice(0,10)}" /></div>
        <div class="field"><label>Bénéficiaire</label><input id="b-beneficiaire" /></div>
        <div class="field"><label>Motif</label><input id="b-motif" /></div>
        <div class="field"><label>Type de ressource</label><select id="b-type"><option value="argent">Somme d'argent</option><option value="materiel">Matériel</option></select></div>
      </div>
      <div class="form-inline" id="b-argent-row">
        <div class="field"><label>Montant</label><input id="b-montant" type="number" /></div>
      </div>
      <div class="form-inline" id="b-materiel-row" style="display:none;">
        <div class="field"><label>Liste de matériel</label><input id="b-materiel" placeholder="ex. 4 chaises, 1 sono" /></div>
      </div>
      <button class="btn btn-primary" id="create-bon">Générer le bon (PDF)</button>
      <div id="bon-error"></div>
    </div>

    <div class="card">
      <div class="card-title">Historique</div>
      <table>
        <thead><tr><th>N°</th><th>Date</th><th>Bénéficiaire</th><th>Motif</th><th>Ressource</th><th>PDF</th></tr></thead>
        <tbody>
          ${bons.map(b => `
            <tr>
              <td>${b.id}</td><td>${b.date}</td><td>${b.beneficiaire}</td><td>${b.motif}</td>
              <td>${b.type_ressource === 'argent' ? fmt(b.montant) : (b.materiel_liste || '')}</td>
              <td><a href="/api/bons/${b.id}/pdf?token=${state.token}" target="_blank" class="link-btn" onclick="return openPdf(event, ${b.id})">Ouvrir</a></td>
            </tr>`).join('') || `<tr><td colspan="6" class="empty-hint">Aucun bon généré</td></tr>`}
        </tbody>
      </table>
    </div>`;

  document.getElementById('b-type').onchange = (e) => {
    document.getElementById('b-argent-row').style.display = e.target.value === 'argent' ? 'flex' : 'none';
    document.getElementById('b-materiel-row').style.display = e.target.value === 'materiel' ? 'flex' : 'none';
  };

  document.getElementById('create-bon').onclick = async () => {
    const type_ressource = document.getElementById('b-type').value;
    const body = {
      date: document.getElementById('b-date').value,
      beneficiaire: document.getElementById('b-beneficiaire').value.trim(),
      motif: document.getElementById('b-motif').value.trim(),
      type_ressource,
      montant: type_ressource === 'argent' ? document.getElementById('b-montant').value : null,
      materiel_liste: type_ressource === 'materiel' ? document.getElementById('b-materiel').value.trim() : null,
    };
    if (!body.beneficiaire || !body.motif) { document.getElementById('bon-error').innerHTML = `<div class="error-msg">Merci de remplir bénéficiaire et motif.</div>`; return; }
    try {
      const result = await api('/api/bons', { method: 'POST', body });
      renderBons(main);
      window.open(`/api/bons/${result.id}/pdf?token=${state.token}`, '_blank');
    } catch (e) {
      document.getElementById('bon-error').innerHTML = `<div class="error-msg">${e.message}</div>`;
    }
  };
}

window.openPdf = function (ev, id) {
  // token passed via query param fallback since <a> doesn't carry auth header;
  // server route also checks Authorization header, so this only works if server allows query token.
  return true;
};

// ---------------- BILLETTERIE ----------------
async function renderBilletterie(main) {
  main.innerHTML = `<h2>Billetterie</h2><div class="empty-hint">Chargement…</div>`;
  const selectedDate = state.billetterieDate || new Date().toISOString().slice(0, 10);
  let vendeuses, ventes;
  try {
    [vendeuses, ventes] = await Promise.all([
      api('/api/billetterie/vendeuses'),
      api('/api/billetterie/ventes?date=' + selectedDate),
    ]);
  } catch (e) { main.innerHTML = `<div class="error-msg">${e.message}</div>`; return; }
  vendeuses = vendeuses.vendeuses; ventes = ventes.ventes;

  let totalAttendu = 0, totalVerse = 0, totalHotesse = 0, totalNet = 0, totalRestants = 0;
  ventes.forEach(v => {
    const restants = v.billets_pris - v.billets_vendus;
    const attendu = v.billets_vendus * v.prix_billet;
    totalAttendu += attendu; totalVerse += v.montant_verse; totalHotesse += v.paiement_hotesse;
    totalNet += (v.montant_verse - v.paiement_hotesse); totalRestants += restants;
  });

  main.innerHTML = `
    <h2>Billetterie</h2>

    <div class="card">
      <div class="card-title">Nouvelle vendeuse</div>
      <div class="form-inline">
        <div class="field"><label>Nom</label><input id="v-nom" placeholder="ex. Fatou Diabaté" /></div>
        <div class="field"><label>Téléphone</label><input id="v-telephone" /></div>
        <button class="btn btn-primary" id="add-vendeuse">Ajouter</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Saisie du jour</div>
      <div class="form-inline">
        <div class="field"><label>Date</label><input id="b-date" type="date" value="${selectedDate}" /></div>
      </div>
      <div class="form-inline">
        <div class="field"><label>Vendeuse</label>
          <select id="b-vendeuse">${vendeuses.map(v => `<option value="${v.id}">${v.nom}</option>`).join('') || '<option value="">Aucune vendeuse enregistrée</option>'}</select>
        </div>
        <div class="field"><label>Prix du billet (500 à 10000 FCFA)</label><input id="b-prix" type="number" min="500" max="10000" step="1" value="500" /></div>
        <div class="field"><label>Billets pris (0 à 1000)</label><input id="b-pris" type="number" min="0" max="1000" value="0" /></div>
        <div class="field"><label>Billets vendus</label><input id="b-vendus" type="number" min="0" max="1000" value="0" /></div>
      </div>
      <div class="form-inline">
        <div class="field"><label>Montant versé (FCFA)</label><input id="b-verse" type="number" min="0" value="0" /></div>
        <div class="field"><label>Paiement hôtesse (FCFA, déduit)</label><input id="b-hotesse" type="number" min="0" value="0" /></div>
        <button class="btn btn-primary" id="add-vente">Enregistrer</button>
      </div>
      <div id="v-error"></div>
    </div>

    <div class="card">
      <div class="card-title">Détail du ${selectedDate}</div>
      <table>
        <thead><tr><th>Vendeuse</th><th>Prix</th><th>Pris</th><th>Vendus</th><th>Restants</th><th>Attendu</th><th>Versé</th><th>Hôtesse</th><th>Net</th></tr></thead>
        <tbody>
          ${ventes.map(v => {
            const restants = v.billets_pris - v.billets_vendus;
            const attendu = v.billets_vendus * v.prix_billet;
            const net = v.montant_verse - v.paiement_hotesse;
            return `<tr>
              <td>${v.vendeuse_nom}</td><td>${fmt(v.prix_billet)}</td><td>${v.billets_pris}</td><td>${v.billets_vendus}</td>
              <td>${restants}</td><td>${fmt(attendu)}</td><td>${fmt(v.montant_verse)}</td><td>${fmt(v.paiement_hotesse)}</td><td>${fmt(net)}</td>
            </tr>`;
          }).join('') || `<tr><td colspan="9" class="empty-hint">Aucune saisie pour cette date</td></tr>`}
        </tbody>
        ${ventes.length ? `<tfoot><tr style="font-weight:700;">
          <td colspan="4">Total</td><td>${totalRestants}</td><td>${fmt(totalAttendu)}</td><td>${fmt(totalVerse)}</td><td>${fmt(totalHotesse)}</td><td>${fmt(totalNet)}</td>
        </tr></tfoot>` : ''}
      </table>
      <button class="btn btn-secondary" id="dl-rapport" style="margin-top:14px;">Télécharger le rapport journalier (PDF)</button>
    </div>`;

  document.getElementById('b-date').onchange = (e) => setState({ billetterieDate: e.target.value, activeTab: 'billetterie' });

  document.getElementById('add-vendeuse').onclick = async () => {
    const nom = document.getElementById('v-nom').value.trim();
    if (!nom) return;
    await api('/api/billetterie/vendeuses', { method: 'POST', body: { nom, telephone: document.getElementById('v-telephone').value.trim() } });
    renderBilletterie(main);
  };

  document.getElementById('add-vente').onclick = async () => {
    const body = {
      date: document.getElementById('b-date').value,
      vendeuse_id: document.getElementById('b-vendeuse').value,
      prix_billet: document.getElementById('b-prix').value,
      billets_pris: document.getElementById('b-pris').value,
      billets_vendus: document.getElementById('b-vendus').value,
      montant_verse: document.getElementById('b-verse').value,
      paiement_hotesse: document.getElementById('b-hotesse').value,
    };
    if (!body.vendeuse_id) { document.getElementById('v-error').innerHTML = `<div class="error-msg">Merci d'ajouter d'abord une vendeuse.</div>`; return; }
    try {
      await api('/api/billetterie/ventes', { method: 'POST', body });
      setState({ billetterieDate: body.date, activeTab: 'billetterie' });
    } catch (e) {
      document.getElementById('v-error').innerHTML = `<div class="error-msg">${e.message}</div>`;
    }
  };

  document.getElementById('dl-rapport').onclick = () => {
    window.open(`/api/billetterie/rapport/${selectedDate}/pdf?token=${state.token}`, '_blank');
  };
}

// ---------------- MON COMPTE ----------------
function renderMonCompte(main) {
  main.innerHTML = `
    <h2>Mon compte</h2>
    <div class="card">
      <div class="card-title">Informations</div>
      <p>${state.user.prenom} ${state.user.nom} — ${state.user.email}</p>
      <p style="color:var(--paper-dim);font-size:13px;">Rôle : ${state.user.role === 'super_admin' ? 'Super-Admin' : state.user.role === 'admin' ? 'Admin' : 'Utilisateur'}</p>
    </div>
    <div class="card">
      <div class="card-title">Changer mon mot de passe</div>
      <label>Mot de passe actuel</label><input id="cp-current" type="password" />
      <label>Nouveau mot de passe</label><input id="cp-new" type="password" />
      <label>Confirmer le nouveau mot de passe</label><input id="cp-confirm" type="password" />
      <div class="btn-row"><button class="btn btn-primary" id="cp-submit">Mettre à jour</button></div>
      <div id="cp-msg"></div>
    </div>`;

  document.getElementById('cp-submit').onclick = async () => {
    const currentPassword = document.getElementById('cp-current').value;
    const newPassword = document.getElementById('cp-new').value;
    const confirm = document.getElementById('cp-confirm').value;
    if (newPassword !== confirm) { document.getElementById('cp-msg').innerHTML = `<div class="error-msg">Les mots de passe ne correspondent pas.</div>`; return; }
    try {
      await api('/api/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
      document.getElementById('cp-msg').innerHTML = `<div class="success-msg">Mot de passe mis à jour.</div>`;
      document.getElementById('cp-current').value = ''; document.getElementById('cp-new').value = ''; document.getElementById('cp-confirm').value = '';
    } catch (e) {
      document.getElementById('cp-msg').innerHTML = `<div class="error-msg">${e.message}</div>`;
    }
  };
}

// ---------------- UTILISATEURS (admin) ----------------
async function renderUtilisateurs(main) {
  main.innerHTML = `<h2>Utilisateurs</h2><div class="empty-hint">Chargement…</div>`;
  const isSuperAdmin = state.user.role === 'super_admin';
  let pending, actifs;
  try {
    [pending, actifs] = await Promise.all([api('/api/users/pending'), api('/api/users')]);
  } catch (e) { main.innerHTML = `<div class="error-msg">${e.message}</div>`; return; }
  pending = pending.users; actifs = actifs.users;

  const roleLabel = r => r === 'super_admin' ? 'Super-Admin' : r === 'admin' ? 'Admin' : 'Utilisateur';

  main.innerHTML = `
    <h2>Utilisateurs</h2>
    <div class="card">
      <div class="card-title">Demandes en attente</div>
      <table>
        <thead><tr><th>Nom</th><th>Email</th><th>Téléphone</th><th>Statut</th><th>Action</th></tr></thead>
        <tbody>
          ${pending.map(u => `
            <tr>
              <td>${u.prenom} ${u.nom}</td><td>${u.email}</td><td>${u.telephone || '-'}</td>
              <td><span class="tag tag-attente">En attente</span></td>
              <td>
                <button class="btn btn-primary approve" data-id="${u.id}" style="padding:6px 12px;">Valider</button>
                <button class="btn btn-danger reject" data-id="${u.id}" style="padding:6px 12px;">Rejeter</button>
              </td>
            </tr>`).join('') || `<tr><td colspan="5" class="empty-hint">Aucune demande en attente</td></tr>`}
        </tbody>
      </table>
    </div>

    <div class="card">
      <div class="card-title">Comptes actifs</div>
      <table>
        <thead><tr><th>Nom</th><th>Email</th><th>Rôle</th>${isSuperAdmin ? '<th>Actions</th>' : ''}</tr></thead>
        <tbody>
          ${actifs.map(u => `
            <tr>
              <td>${u.prenom} ${u.nom}</td><td>${u.email}</td>
              <td>${isSuperAdmin ? `
                <select class="role-select" data-id="${u.id}" ${u.id === state.user.id ? 'disabled title="Vous ne pouvez pas modifier votre propre rôle ici"' : ''}>
                  <option value="utilisateur" ${u.role === 'utilisateur' ? 'selected' : ''}>Utilisateur</option>
                  <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                  <option value="super_admin" ${u.role === 'super_admin' ? 'selected' : ''}>Super-Admin</option>
                </select>` : roleLabel(u.role)}
              </td>
              ${isSuperAdmin ? `<td><button class="btn btn-secondary reset-pw" data-id="${u.id}" data-name="${u.prenom} ${u.nom}" style="padding:6px 12px;">Réinitialiser le mot de passe</button></td>` : ''}
            </tr>`).join('') || `<tr><td colspan="4" class="empty-hint">Aucun compte actif</td></tr>`}
        </tbody>
      </table>
      <div id="u-msg"></div>
    </div>`;

  document.querySelectorAll('.approve, .reject').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      const action = btn.classList.contains('approve') ? 'approve' : 'reject';
      await api(`/api/users/${id}/${action}`, { method: 'POST' });
      renderUtilisateurs(main);
    };
  });

  document.querySelectorAll('.role-select').forEach(sel => {
    sel.onchange = async () => {
      try {
        await api(`/api/users/${sel.dataset.id}/role`, { method: 'POST', body: { role: sel.value } });
        document.getElementById('u-msg').innerHTML = `<div class="success-msg">Rôle mis à jour.</div>`;
      } catch (e) {
        document.getElementById('u-msg').innerHTML = `<div class="error-msg">${e.message}</div>`;
        renderUtilisateurs(main);
      }
    };
  });

  document.querySelectorAll('.reset-pw').forEach(btn => {
    btn.onclick = async () => {
      const newPassword = prompt(`Nouveau mot de passe pour ${btn.dataset.name} (6 caractères minimum) :`);
      if (!newPassword) return;
      try {
        await api(`/api/users/${btn.dataset.id}/reset-password`, { method: 'POST', body: { newPassword } });
        document.getElementById('u-msg').innerHTML = `<div class="success-msg">Mot de passe réinitialisé pour ${btn.dataset.name}.</div>`;
      } catch (e) {
        document.getElementById('u-msg').innerHTML = `<div class="error-msg">${e.message}</div>`;
      }
    };
  });
}

// ---------------- PARAMETRES (admin) ----------------
async function renderParametres(main) {
  main.innerHTML = `<h2>Paramètres identitaires</h2><div class="empty-hint">Chargement…</div>`;
  let identite;
  try { identite = (await api('/api/identite')).identite; } catch (e) { main.innerHTML = `<div class="error-msg">${e.message}</div>`; return; }
  identite = identite || {};

  const imgField = (id, label, value) => `
    <div class="field" style="flex:1;min-width:180px;">
      <label>${label}</label>
      <div class="file-drop" id="${id}-drop">
        <input type="file" id="${id}-file" accept="image/png,image/jpeg" style="display:none;" />
        <span>Cliquer pour importer (PNG/JPG)</span>
        ${value ? `<img src="${value}" class="file-preview" id="${id}-preview" />` : `<div id="${id}-preview-holder"></div>`}
      </div>
    </div>`;

  main.innerHTML = `
    <h2>Paramètres identitaires</h2>
    <div class="card">
      <label>Nom de la structure</label>
      <input id="p-nom" value="${identite.nom_structure || ''}" />
      <div class="form-inline" style="margin-top:16px;">
        ${imgField('logo', 'Logo', identite.logo_base64)}
        ${imgField('tampon', 'Tampon', identite.tampon_base64)}
        ${imgField('signature', 'Signature', identite.signature_base64)}
      </div>
      <button class="btn btn-primary" id="save-identite" style="margin-top:10px;">Enregistrer</button>
      <div id="p-msg"></div>
    </div>`;

  let pending = {};
  ['logo', 'tampon', 'signature'].forEach(key => {
    const drop = document.getElementById(`${key}-drop`);
    const fileInput = document.getElementById(`${key}-file`);
    drop.onclick = () => fileInput.click();
    fileInput.onchange = async () => {
      const file = fileInput.files[0];
      if (!file) return;
      const b64 = await fileToBase64(file);
      pending[key] = b64;
      let preview = document.getElementById(`${key}-preview`);
      if (!preview) {
        preview = document.createElement('img');
        preview.id = `${key}-preview`;
        preview.className = 'file-preview';
        drop.appendChild(preview);
      }
      preview.src = b64;
    };
  });

  document.getElementById('save-identite').onclick = async () => {
    try {
      await api('/api/identite', {
        method: 'POST', body: {
          nom_structure: document.getElementById('p-nom').value.trim(),
          logo_base64: pending.logo || null,
          tampon_base64: pending.tampon || null,
          signature_base64: pending.signature || null,
        }
      });
      document.getElementById('p-msg').innerHTML = `<div class="success-msg">Paramètres enregistrés.</div>`;
    } catch (e) {
      document.getElementById('p-msg').innerHTML = `<div class="error-msg">${e.message}</div>`;
    }
  };
}

// ---------------- ROUTER ----------------
function render() {
  if (state.view === 'onboarding') return renderOnboarding();
  if (state.view === 'login') return renderLogin();
  if (state.view === 'register') return renderRegister();
  if (state.view === 'app') return renderApp();
  APP.innerHTML = `<div class="centered-screen"><div class="panel"><p class="lead">Chargement…</p></div></div>`;
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

boot();
