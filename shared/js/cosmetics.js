// Katalog des Shops (shop/): Skins und Spuren für die Figur, gemeinsam für alle Spiele. Alles ist
// frei und kann jederzeit ausgerüstet werden - gespeichert wird nur, was ausgerüstet ist (Profil),
// gezeichnet wird in cosmetics-draw.js.
//
// Spuren: Jedes Spiel bringt seine eigene mit (game). Solange man keine ausrüstet, hat jedes Spiel
// seine eigene; rüstet man eine aus, gilt sie in allen Spielen.
//
// NEUES ITEM: eine Zeile in SKINS bzw. TRAILS. Eine Spur braucht einen Stil (style) aus
// SL.TrailStyles in cosmetics-draw.js. IDs nie ändern - daran hängt, was ausgerüstet ist.
window.SL = window.SL || {};

(function () {
  const SKINS = [
    { id: "default", name: "Standard" },
  ];

  const TRAILS = [
    { id: "trail-maze", name: "Maze", game: "maze", style: "dots" },
    { id: "trail-drift", name: "Drift", game: "drift", style: "streak" },
    { id: "trail-leap", name: "Leap", game: "leap", style: "growing" },
  ];

  // Kategorien in Shop-Reihenfolge: Name für Überschriften + die Items
  SL.COSMETIC_TYPES = [
    { id: "skin", name: "Skins", hint: "Der Körper deiner Figur", items: SKINS },
    { id: "trail", name: "Spuren", hint: "Was die Figur hinter sich lässt – aus jedem Spiel eine", items: TRAILS },
  ];
  SL.COSMETICS = SL.COSMETIC_TYPES.flatMap((t) => t.items.map((item) => Object.assign(item, { type: t.id })));
})();

SL.Cosmetics = {
  get(id) {
    return SL.COSMETICS.find((c) => c.id === id) || null;
  },

  // Ausgerüstetes Item einer Kategorie. Skin: immer einer (sonst der erste). Spur: null, solange
  // jedes Spiel seine eigene hat.
  equipped(type) {
    const cos = this.get(SL.Profile.equippedCosmetic(type));
    if (cos && cos.type === type) return cos;
    return type === "skin" ? SL.COSMETICS.find((c) => c.type === "skin") : null;
  },

  // Spur, mit der ein Spiel zeichnet: die ausgerüstete, sonst seine eigene
  trailFor(gameId) {
    return this.equipped("trail") || SL.COSMETICS.find((c) => c.type === "trail" && c.game === gameId);
  },

  equip(id) {
    const cos = this.get(id);
    if (cos) SL.Profile.equipCosmetic(cos.type, cos.id);
  },

  // Wieder der Standard (bei Spuren: jedes Spiel seine eigene)
  unequip(type) {
    SL.Profile.equipCosmetic(type, null);
  },
};
