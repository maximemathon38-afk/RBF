import { supabase } from "./supabase.js";

function fail(error) {
  if (error) throw new Error(error.message || "Une erreur est survenue.");
}

export async function loadAppData() {
  const [locationsResult, materialsResult, movementsResult, attachmentsResult] = await Promise.all([
    supabase.from("locations").select("*").order("type").order("name"),
    supabase.from("materials").select("*").order("updated_at", { ascending: false }),
    supabase
      .from("movements")
      .select("*, from_location:locations!movements_from_location_id_fkey(name), to_location:locations!movements_to_location_id_fkey(name)")
      .order("moved_at", { ascending: false })
      .limit(500),
    supabase.from("attachments").select("*").order("uploaded_at", { ascending: false }),
  ]);
  [locationsResult, materialsResult, movementsResult, attachmentsResult].forEach((result) => fail(result.error));
  return {
    locations: locationsResult.data || [],
    materials: materialsResult.data || [],
    movements: (movementsResult.data || []).map((movement) => ({
      ...movement,
      from_location_name: movement.from_location?.name || null,
      to_location_name: movement.to_location?.name || "Emplacement inconnu",
    })),
    attachments: attachmentsResult.data || [],
  };
}

export async function saveLocation(location) {
  const payload = {
    name: location.name.trim(),
    type: location.type,
    address: location.address?.trim() || "",
    manager: location.manager?.trim() || "",
    status: location.status,
  };
  const query = location.id
    ? supabase.from("locations").update(payload).eq("id", location.id)
    : supabase.from("locations").insert(payload);
  const { error } = await query;
  fail(error);
}

export async function saveMaterial(material, userEmail) {
  const payload = {
    name: material.name.trim(),
    category: material.category,
    description: material.description?.trim() || "",
    serial_number: material.serial_number?.trim() || "",
    quantity: Number(material.quantity) || 1,
    unit: material.unit?.trim() || "pièce",
    status: material.status,
    location_id: material.location_id,
  };
  if (material.id) {
    const { error } = await supabase.from("materials").update(payload).eq("id", material.id);
    fail(error);
    return;
  }
  const { data, error } = await supabase.from("materials").insert(payload).select().single();
  fail(error);
  const { error: movementError } = await supabase.from("movements").insert({
    material_id: data.id,
    tracking_group_id: data.tracking_group_id,
    material_name: data.name,
    from_location_id: null,
    to_location_id: data.location_id,
    quantity: data.quantity,
    movement_type: "ajout",
    note: "Ajout du matériel à l’inventaire",
    actor: userEmail || "Utilisateur",
  });
  fail(movementError);
}

export async function transferMaterial(materialId, destinationId, quantity, note) {
  const { error } = await supabase.rpc("transfer_material", {
    p_material_id: materialId,
    p_destination_id: destinationId,
    p_quantity: Number(quantity),
    p_note: note?.trim() || "",
  });
  fail(error);
}

export async function uploadAttachment(material, documentType, file) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120) || "document";
  const storagePath = `${material.tracking_group_id}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage
    .from("materiel-documents")
    .upload(storagePath, file, { contentType: file.type || "application/octet-stream", upsert: false });
  fail(uploadError);
  const { error: insertError } = await supabase.from("attachments").insert({
    material_id: material.id,
    tracking_group_id: material.tracking_group_id,
    document_type: documentType,
    file_name: file.name,
    storage_path: storagePath,
    mime_type: file.type || "application/octet-stream",
    size_bytes: file.size,
  });
  if (insertError) {
    await supabase.storage.from("materiel-documents").remove([storagePath]);
    fail(insertError);
  }
}

export async function openAttachment(attachment) {
  const { data, error } = await supabase.storage
    .from("materiel-documents")
    .createSignedUrl(attachment.storage_path, 120);
  fail(error);
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}
