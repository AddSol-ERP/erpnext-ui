// 👉 Keep this PURE (only API logic)

export async function loadEntryTypesAPI() {
  try {
    // 🔁 Replace with real frappe call later
    // Example:
    // const res = await frappe.call({...})

    const res = [
      { name: "Material Issue", group: "outgoing" },
      { name: "Material Receipt", group: "incoming" },
      { name: "Material Transfer", group: "transfer" },
      { name: "Manufacture", group: "incoming" },
      { name: "Repack", group: "adjustment" },
      { name: "Disassemble", group: "adjustment" },
      { name: "Send to Subcontractor", group: "outgoing" },
      { name: "Material Transfer for Manufacture", group: "transfer" },
      { name: "Material Consumption for Manufacture", group: "outgoing" },
    ];

    return res;
  } catch (err) {
    console.error("Failed to load entry types", err);
    return [];
  }
}
