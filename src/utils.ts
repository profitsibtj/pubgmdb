export const PUBGM_WEAPONS = [
  "M416", "M762", "SCAR-L", "AKM", "AWM", "Micro UZI", "UMP45", "AMR", "M24", "Mini14", 
  "DP-28", "SLR", "DBS", "AUG", "FAMAS", "Groza", "MK14", "S12K", "Thompson SMG", "Vector", "SKS"
].sort();

export const calculatePlacementPoints = (placement: number): number => {
  const p = Number(placement) || 0;
  if (p === 1) return 10;
  if (p === 2) return 6;
  if (p === 3) return 5;
  if (p === 4) return 4;
  if (p === 5) return 3;
  if (p === 6) return 2;
  if (p === 7 || p === 8) return 1;
  return 0;
};

