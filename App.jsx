import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight, Boxes, Building2, ChevronRight, ClipboardList, FileText,
  HardHat, History, LogOut, MapPin, PackagePlus, Paperclip, Pencil,
  Plus, Search, Send, Settings2, ShieldCheck, Warehouse, Wrench, X,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { configurationOk, supabase } from "./supabase.js";
import {
  loadAppData, openAttachment, saveLocation, saveMaterial,
  transferMaterial, uploadAttachment,
} from "./api.js";

const EMPTY_DATA = { locations: [], materials: [], movements: [], attachments: [] };
const CATEGORIES = ["Électroportatif", "Passerelle", "Levage", "Outillage", "Sécurité", "Consommable", "Autre"];
const STATUS = { disponible: "Disponible", chantier: "En chantier", reparation: "En réparation", controle: "À contrôler" };
const DOCUMENT_TYPES = { facture_achat: "Facture d’achat", facture_reparation: "Facture de réparation", fiche_suivi: "Fiche de suivi", autre: "Autre document" };
const NEW_LOCATION = { name: "", type: "chantier", address: "", manager: "", status: "active" };
const NEW_MATERIAL = { name: "", category: "Électroportatif", description: "", serial_number: "", quantity: 1, unit: "pièce", status: "disponible", location_id: "" };

function dateFr(value) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
function fileSize(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} Ko` : `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState("dashboard");
  const [query, setQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("all");
  const [locationDraft, setLocationDraft] = useState(null);
  const [materialDraft, setMaterialDraft] = useState(null);
  const [transferTarget, setTransferTarget] = useState(null);
  const [documentTarget, setDocumentTarget] = useState(null);
  const [detailId, setDetailId] = useState(null);

  useEffect(() => {
    if (!configurationOk) { setCheckingSession(false); return undefined; }
    supabase.auth.getSession().then(({ data: authData }) => {
      setSession(authData.session);
      setCheckingSession(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => listener.subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try { setData(await loadAppData()); }
    catch (error) { toast.error(error.message); }
    finally { setLoading(false); }
  }, [session]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (!configurationOk) return <ConfigurationScreen />;
  if (checkingSession) return <LoadingScreen />;
  if (!session) return <LoginScreen />;

  const locations = data.locations.filter((location) => location.status === "active");
  const locationMap = new Map(data.locations.map((location) => [location.id, location]));
  const selectedMaterial = data.materials.find((material) => material.id === detailId) || null;
  const filteredMaterials = data.materials.filter((material) => {
    const haystack = `${material.name} ${material.category} ${material.serial_number} ${material.description}`.toLowerCase();
    return (locationFilter === "all" || material.location_id === locationFilter) && (!query || haystack.includes(query.toLowerCase()));
  });
  const totals = {
    pieces: data.materials.reduce((sum, material) => sum + material.quantity, 0),
    chantiers: data.locations.filter((location) => location.type === "chantier" && location.status === "active").length,
    repairs: data.materials.filter((material) => material.status === "reparation").length,
    documents: data.attachments.length,
  };

  const openNewMaterial = (locationId = "") => setMaterialDraft({ ...NEW_MATERIAL, location_id: locationId || locations[0]?.id || "" });
  const run = async (action, success, close) => {
    try { await action(); await refresh(); close(); toast.success(success); }
    catch (error) { toast.error(error.message); }
  };

  return (
    <div className="app-shell">
      <Toaster richColors position="top-right" />
      <aside className="sidebar">
        <div className="brand"><span className="brand-badge">RBF</span><div><strong>Rosset Boulon</strong><small>&amp; Fils</small></div></div>
        <nav>
          <NavButton active={view === "dashboard"} icon={<Boxes />} onClick={() => setView("dashboard")}>Vue d’ensemble</NavButton>
          <NavButton active={view === "inventory"} icon={<ClipboardList />} onClick={() => setView("inventory")}>Inventaire</NavButton>
          <NavButton active={view === "history"} icon={<History />} onClick={() => setView("history")}>Mouvements</NavButton>
        </nav>
        <div className="sidebar-bottom"><ShieldCheck /><span>Connexion sécurisée<br />{session.user.email}</span></div>
      </aside>

      <main className="stage">
        <header className="topbar">
          <div><span className="eyebrow">Gestion opérationnelle</span><h1>Suivi du matériel</h1></div>
          <div className="top-actions">
            <button className="button secondary" onClick={() => setLocationDraft({ ...NEW_LOCATION })}><Building2 /> Ajouter un chantier</button>
            <button className="button primary" onClick={() => openNewMaterial()}><PackagePlus /> Ajouter du matériel</button>
            <button className="button icon-only" title="Se déconnecter" onClick={() => supabase.auth.signOut()}><LogOut /></button>
          </div>
        </header>

        <div className="mobile-nav">
          <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>Vue d’ensemble</button>
          <button className={view === "inventory" ? "active" : ""} onClick={() => setView("inventory")}>Inventaire</button>
          <button className={view === "history" ? "active" : ""} onClick={() => setView("history")}>Mouvements</button>
        </div>

        {view === "dashboard" && <Dashboard data={data} totals={totals} locations={locations} setLocationDraft={setLocationDraft} setView={setView} setLocationFilter={setLocationFilter} openNewMaterial={openNewMaterial} />}
        {view === "inventory" && <Inventory loading={loading} materials={filteredMaterials} locations={data.locations} locationMap={locationMap} attachments={data.attachments} query={query} setQuery={setQuery} locationFilter={locationFilter} setLocationFilter={setLocationFilter} openNewMaterial={openNewMaterial} setMaterialDraft={setMaterialDraft} setTransferTarget={setTransferTarget} setDetailId={setDetailId} />}
        {view === "history" && <HistoryView movements={data.movements} />}
      </main>

      {locationDraft && <LocationModal draft={locationDraft} setDraft={setLocationDraft} onClose={() => setLocationDraft(null)} onSave={() => run(() => saveLocation(locationDraft), locationDraft.id ? "Emplacement modifié." : "Emplacement ajouté.", () => setLocationDraft(null))} />}
      {materialDraft && <MaterialModal draft={materialDraft} setDraft={setMaterialDraft} locations={locations} onClose={() => setMaterialDraft(null)} onSave={() => run(() => saveMaterial(materialDraft, session.user.email), materialDraft.id ? "Matériel modifié." : "Matériel ajouté.", () => setMaterialDraft(null))} />}
      {transferTarget && <TransferModal material={transferTarget} locations={locations} onClose={() => setTransferTarget(null)} onSave={(destinationId, quantity, note) => run(() => transferMaterial(transferTarget.id, destinationId, quantity, note), "Transfert enregistré.", () => setTransferTarget(null))} />}
      {documentTarget && <DocumentModal material={documentTarget} onClose={() => setDocumentTarget(null)} onSave={(type, file) => run(() => uploadAttachment(documentTarget, type, file), "Document ajouté.", () => setDocumentTarget(null))} />}
      {selectedMaterial && <MaterialDrawer material={selectedMaterial} location={locationMap.get(selectedMaterial.location_id)} movements={data.movements.filter((movement) => movement.tracking_group_id === selectedMaterial.tracking_group_id)} attachments={data.attachments.filter((attachment) => attachment.tracking_group_id === selectedMaterial.tracking_group_id)} onClose={() => setDetailId(null)} onEdit={() => setMaterialDraft({ ...selectedMaterial })} onTransfer={() => setTransferTarget(selectedMaterial)} onDocument={() => setDocumentTarget(selectedMaterial)} />}
    </div>
  );
}

function ConfigurationScreen() {
  return <div className="center-screen"><div className="setup-card"><span className="brand-badge large">RBF</span><h1>Configuration Supabase requise</h1><p>Copie le fichier <code>.env.example</code> en <code>.env.local</code>, puis remplace les deux valeurs par celles de ton projet Supabase.</p><p>Le guide <strong>README.md</strong> explique toutes les étapes.</p></div></div>;
}
function LoadingScreen() { return <div className="center-screen"><div className="loader" /><p>Chargement…</p></div>; }
function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) toast.error("Identifiants incorrects.");
    setLoading(false);
  };
  return <div className="login-screen"><Toaster richColors position="top-right" /><form className="login-card" onSubmit={submit}><div className="brand login-brand"><span className="brand-badge">RBF</span><div><strong>Rosset Boulon</strong><small>&amp; Fils</small></div></div><span className="eyebrow">Espace sécurisé</span><h1>Suivi du matériel</h1><label>Adresse e-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Mot de passe<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label><button className="button primary wide" disabled={loading}>{loading ? "Connexion…" : "Se connecter"}</button><p>Le compte est créé depuis Supabase → Authentication → Users.</p></form></div>;
}

function NavButton({ active, icon, children, onClick }) { return <button className={`nav-button ${active ? "active" : ""}`} onClick={onClick}>{icon}<span>{children}</span></button>; }
function Stat({ icon, label, value, detail, warning }) { return <article className={`stat ${warning ? "warning" : ""}`}><div className="stat-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>; }
function Status({ value }) { return <span className={`status status-${value}`}><i />{STATUS[value] || value}</span>; }

function Dashboard({ data, totals, locations, setLocationDraft, setView, setLocationFilter, openNewMaterial }) {
  return <div className="page">
    <section className="stats"><Stat icon={<Boxes />} label="Matériel suivi" value={totals.pieces} detail={`${data.materials.length} références`} /><Stat icon={<HardHat />} label="Chantiers actifs" value={totals.chantiers} detail="hors dépôt" /><Stat icon={<Wrench />} label="En réparation" value={totals.repairs} detail="à surveiller" warning={totals.repairs > 0} /><Stat icon={<FileText />} label="Documents" value={totals.documents} detail="factures et fiches" /></section>
    <section className="panel"><PanelTitle kicker="Implantations" title="Dépôt et chantiers" action={<button className="text-button" onClick={() => setLocationDraft({ ...NEW_LOCATION })}><Plus />Ajouter</button>} /><div className="location-grid">{locations.map((location) => { const quantity = data.materials.filter((material) => material.location_id === location.id).reduce((sum, material) => sum + material.quantity, 0); return <article className={`location-card ${location.type}`} key={location.id}><div className="location-icon">{location.type === "depot" ? <Warehouse /> : <HardHat />}</div><button className="edit-icon" onClick={() => setLocationDraft({ ...location })}><Pencil /></button><small>{location.type === "depot" ? "Dépôt" : "Chantier"}</small><h3>{location.name}</h3><p><MapPin />{location.address || "Adresse à renseigner"}</p><div><strong>{quantity} pièce{quantity > 1 ? "s" : ""}</strong><button onClick={() => { setLocationFilter(location.id); setView("inventory"); }}>Voir le stock<ChevronRight /></button></div></article>; })}</div></section>
    <div className="dashboard-bottom"><section className="panel"><PanelTitle kicker="Traçabilité" title="Derniers mouvements" action={<button className="text-button" onClick={() => setView("history")}>Tout voir</button>} /><MovementList movements={data.movements.slice(0, 5)} /></section><section className="quick-card"><span className="eyebrow">Action rapide</span><h2>Un matériel change de chantier ?</h2><p>Ouvre l’inventaire, choisis le matériel puis enregistre son transfert.</p><button className="button light" onClick={() => setView("inventory")}>Choisir le matériel<ArrowRight /></button><button className="button outline-light" onClick={() => openNewMaterial()}>Ajouter du matériel<Plus /></button></section></div>
  </div>;
}
function PanelTitle({ kicker, title, action }) { return <div className="panel-title"><div><span className="eyebrow">{kicker}</span><h2>{title}</h2></div>{action}</div>; }

function Inventory({ loading, materials, locations, locationMap, attachments, query, setQuery, locationFilter, setLocationFilter, openNewMaterial, setMaterialDraft, setTransferTarget, setDetailId }) {
  return <div className="page"><section className="panel inventory-panel"><PanelTitle kicker="Stock centralisé" title="Inventaire du matériel" action={<button className="button primary" onClick={() => openNewMaterial()}><Plus />Nouveau matériel</button>} /><div className="filters"><label className="search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un matériel, n° de série…" /></label><select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}><option value="all">Tous les emplacements</option>{locations.map((location) => <option value={location.id} key={location.id}>{location.name}</option>)}</select></div>{loading ? <Empty text="Chargement de l’inventaire…" /> : materials.length === 0 ? <Empty text="Aucun matériel trouvé." /> : <div className="table-wrap"><table><thead><tr><th>Matériel</th><th>Emplacement</th><th>Quantité</th><th>Statut</th><th>Documents</th><th>Actions</th></tr></thead><tbody>{materials.map((material) => { const docs = attachments.filter((item) => item.tracking_group_id === material.tracking_group_id).length; return <tr key={material.id} onClick={() => setDetailId(material.id)}><td data-label="Matériel"><div className="material-name"><span>{material.category === "Passerelle" ? <Settings2 /> : <Wrench />}</span><div><strong>{material.name}</strong><small>{material.category}{material.serial_number ? ` · N° ${material.serial_number}` : ""}</small></div></div></td><td data-label="Emplacement">{locationMap.get(material.location_id)?.name || "Inconnu"}</td><td data-label="Quantité"><strong>{material.quantity}</strong> {material.unit}</td><td data-label="Statut"><Status value={material.status} /></td><td data-label="Documents">{docs ? <span className="document-count"><Paperclip />{docs}</span> : "—"}</td><td data-label="Actions"><div className="table-actions" onClick={(event) => event.stopPropagation()}><button className="button small secondary" onClick={() => setTransferTarget(material)}><Send />Transférer</button><button className="button small icon-only" onClick={() => setMaterialDraft({ ...material })}><Pencil /></button></div></td></tr>; })}</tbody></table></div>}</section></div>;
}
function Empty({ text }) { return <div className="empty"><Boxes /><p>{text}</p></div>; }
function HistoryView({ movements }) { return <div className="page"><section className="panel history-panel"><PanelTitle kicker="Journal complet" title="Historique des mouvements" action={<span className="count-badge">{movements.length} mouvements</span>} /><MovementList movements={movements} detailed /></section></div>; }
function MovementList({ movements, detailed }) { if (!movements.length) return <div className="empty-small">Aucun mouvement enregistré.</div>; return <div className="movements">{movements.map((movement) => <article className="movement" key={movement.id}><span className={`movement-icon ${movement.movement_type}`}><ArrowRight /></span><div><div><strong>{movement.material_name}</strong><small>{movement.quantity} unité{movement.quantity > 1 ? "s" : ""}</small></div><p>{movement.from_location_name ? <>{movement.from_location_name} <ArrowRight /></> : "Ajouté à"}<b>{movement.to_location_name}</b></p>{detailed && movement.note && <em>{movement.note}</em>}</div><time>{dateFr(movement.moved_at)}</time></article>)}</div>; }

function Modal({ title, description, children, onClose, onSubmit, submitLabel = "Enregistrer" }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="modal" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}><button type="button" className="close" onClick={onClose}><X /></button><h2>{title}</h2>{description && <p className="modal-description">{description}</p>}<div className="modal-body">{children}</div><footer><button type="button" className="button secondary" onClick={onClose}>Annuler</button><button className="button primary">{submitLabel}</button></footer></form></div>;
}
function Field({ label, children, full }) { return <label className={full ? "full" : ""}><span>{label}</span>{children}</label>; }
function LocationModal({ draft, setDraft, onClose, onSave }) { return <Modal title={draft.id ? "Modifier l’emplacement" : "Ajouter un emplacement"} description="Crée un chantier ou organise le dépôt." onClose={onClose} onSubmit={onSave}><div className="form-grid"><Field label="Type"><select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}><option value="chantier">Chantier</option><option value="depot">Dépôt</option></select></Field><Field label="Nom *"><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required /></Field><Field label="Adresse" full><input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></Field><Field label="Responsable"><input value={draft.manager} onChange={(e) => setDraft({ ...draft, manager: e.target.value })} /></Field><Field label="État"><select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}><option value="active">Actif</option><option value="archive">Archivé</option></select></Field></div></Modal>; }
function MaterialModal({ draft, setDraft, locations, onClose, onSave }) { return <Modal title={draft.id ? "Modifier le matériel" : "Ajouter du matériel"} description="Renseigne sa fiche et son emplacement actuel." onClose={onClose} onSubmit={onSave} submitLabel="Enregistrer le matériel"><div className="form-grid"><Field label="Désignation *"><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required /></Field><Field label="Catégorie"><select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></Field><Field label="Emplacement *"><select value={draft.location_id} onChange={(e) => setDraft({ ...draft, location_id: e.target.value })} required><option value="">Choisir</option>{locations.map((location) => <option value={location.id} key={location.id}>{location.name}</option>)}</select></Field><Field label="Statut"><select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>{Object.entries(STATUS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field><Field label="Quantité"><input type="number" min="1" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} required /></Field><Field label="Unité"><input value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} /></Field><Field label="Numéro de série / identification" full><input value={draft.serial_number} onChange={(e) => setDraft({ ...draft, serial_number: e.target.value })} /></Field><Field label="Description" full><textarea rows="4" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field></div></Modal>; }
function TransferModal({ material, locations, onClose, onSave }) { const [destination, setDestination] = useState(locations.find((location) => location.id !== material.location_id)?.id || ""); const [quantity, setQuantity] = useState(material.quantity); const [note, setNote] = useState(""); return <Modal title="Transférer le matériel" description={`${material.name} · ${material.quantity} ${material.unit}`} onClose={onClose} onSubmit={() => onSave(destination, quantity, note)} submitLabel="Confirmer le transfert"><div className="form-column"><Field label="Destination *"><select value={destination} onChange={(e) => setDestination(e.target.value)} required><option value="">Choisir</option>{locations.filter((location) => location.id !== material.location_id).map((location) => <option value={location.id} key={location.id}>{location.name}</option>)}</select></Field><Field label="Quantité"><input type="number" min="1" max={material.quantity} value={quantity} onChange={(e) => setQuantity(e.target.value)} required /></Field><Field label="Note"><textarea rows="3" value={note} onChange={(e) => setNote(e.target.value)} /></Field></div></Modal>; }
function DocumentModal({ material, onClose, onSave }) { const [type, setType] = useState(material.category === "Passerelle" ? "fiche_suivi" : "facture_achat"); const [file, setFile] = useState(null); return <Modal title="Ajouter une pièce jointe" description={`Document associé à ${material.name} · 15 Mo maximum.`} onClose={onClose} onSubmit={() => file && onSave(type, file)} submitLabel="Ajouter le document"><div className="form-column"><Field label="Type de document"><select value={type} onChange={(e) => setType(e.target.value)}>{Object.entries(DOCUMENT_TYPES).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field><label className="file-drop"><Paperclip /><strong>{file ? file.name : "Choisir un fichier"}</strong><small>{file ? fileSize(file.size) : "PDF, image, Word ou Excel"}</small><input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} required /></label></div></Modal>; }

function MaterialDrawer({ material, location, movements, attachments, onClose, onEdit, onTransfer, onDocument }) {
  return <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><aside className="drawer"><button className="close" onClick={onClose}><X /></button><div className="drawer-head"><span className="drawer-icon">{material.category === "Passerelle" ? <Settings2 /> : <Wrench />}</span><h2>{material.name}</h2><p>{material.category} · {location?.name || "Emplacement inconnu"}</p></div><div className="drawer-body"><div className="drawer-actions"><button className="button primary" onClick={onTransfer}><Send />Transférer</button><button className="button secondary" onClick={onEdit}><Pencil />Modifier</button><button className="button secondary" onClick={onDocument}><Paperclip />Document</button></div><div className="details"><div><small>Quantité</small><strong>{material.quantity} {material.unit}</strong></div><div><small>Statut</small><Status value={material.status} /></div><div><small>N° de série</small><strong>{material.serial_number || "Non renseigné"}</strong></div><div><small>Emplacement</small><strong>{location?.name || "Inconnu"}</strong></div></div>{material.description && <DrawerSection title="Description"><p>{material.description}</p></DrawerSection>}<DrawerSection title="Documents" action={<button className="text-button" onClick={onDocument}><Plus />Ajouter</button>}>{attachments.length ? <div className="documents">{attachments.map((attachment) => <button key={attachment.id} onClick={() => openAttachment(attachment)}><FileText /><span><strong>{attachment.file_name}</strong><small>{DOCUMENT_TYPES[attachment.document_type]} · {fileSize(attachment.size_bytes)}</small></span><ChevronRight /></button>)}</div> : <div className="empty-small">Aucun document joint.</div>}</DrawerSection><DrawerSection title="Historique"><MovementList movements={movements} detailed /></DrawerSection></div></aside></div>;
}
function DrawerSection({ title, action, children }) { return <section className="drawer-section"><div><h3>{title}</h3>{action}</div>{children}</section>; }
