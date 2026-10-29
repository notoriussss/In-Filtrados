// Feature flags for UI that is designed but has no server support yet
// (docs/design/ui-pending-backend.md). While a flag is false the screens
// look exactly as they do today. Turning one on needs the contract named
// in that document; the flag alone does not make anything work.

export const FEATURES = {
  lobbyChat: false, // room chat in the lobby (maqueta 06-lobby)
  colorPicker: true, // choosing a color in the lobby (maqueta 06-lobby)
  accessoryPicker: true, // choosing an accessory (maqueta 06-lobby)
  publicRooms: false, // public rooms list (maqueta 04-unirse)
} as const;

export type FeatureName = keyof typeof FEATURES;
