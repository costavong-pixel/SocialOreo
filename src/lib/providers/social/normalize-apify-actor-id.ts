export function normalizeApifyActorId(actorId: string): string {
  return actorId.replace(/\//g, "~");
}
