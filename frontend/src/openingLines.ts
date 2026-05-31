/** Curated opening mainlines for step-through study (UCI from start). */

export type OpeningLine = {
  id: string
  name: string
  eco?: string
  description: string
  movesUci: string[]
}

export const OPENING_LINES: OpeningLine[] = [
  {
    id: 'italian',
    name: 'Italian Game',
    eco: 'C50',
    description:
      'Classical open game: both sides develop knights and bishops toward the center. Watch how White targets f7 and Black defends.',
    movesUci: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'c2c3', 'g8f6'],
  },
  {
    id: 'london',
    name: 'London System',
    eco: 'D02',
    description:
      'White builds a solid pawn triangle (d4, e3) and develops the bishop to f4 before finishing kingside development.',
    movesUci: ['d2d4', 'd7d5', 'c1f4', 'g8f6', 'e2e3', 'e7e6', 'g1f3', 'f8d6'],
  },
  {
    id: 'queens_gambit',
    name: "Queen's Gambit",
    eco: 'D06',
    description:
      'White offers the c-pawn to fight for the center. Black often accepts or declines with ...e6 (Orthodox).',
    movesUci: ['d2d4', 'd7d5', 'c2c4', 'e7e6', 'b1c3', 'g8f6', 'c4d5', 'f6d5'],
  },
  {
    id: 'kings_pawn',
    name: "King's Pawn (Open Game)",
    eco: 'C44',
    description: 'The most popular first move. Leads to open positions with rapid piece development for both sides.',
    movesUci: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'd2d4', 'e5d4', 'f3d4'],
  },
  {
    id: 'sicilian',
    name: 'Sicilian Defense',
    eco: 'B20',
    description:
      'Black fights for the center asymmetrically. White often builds a kingside pawn majority.',
    movesUci: ['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6'],
  },
  {
    id: 'french',
    name: 'French Defense',
    eco: 'C00',
    description:
      'Black stakes a claim on e5 with ...e6 and ...d5, accepting a cramped queen\'s bishop for a solid structure.',
    movesUci: ['e2e4', 'e7e6', 'd2d4', 'd7d5', 'b1c3', 'g8f6', 'e4e5', 'f6d7'],
  },
  {
    id: 'english',
    name: 'English Opening',
    eco: 'A10',
    description:
      'Flank opening: White controls d5 from the side. Often transposes into reversed Sicilian structures.',
    movesUci: ['c2c4', 'e7e5', 'b1c3', 'g8f6', 'g2g3', 'b7b6', 'f1g2', 'f8b7'],
  },
  {
    id: 'caro_kann',
    name: 'Caro-Kann Defense',
    eco: 'B10',
    description:
      'Solid reply to 1.e4: ...c6 supports ...d5 without blocking the light-squared bishop.',
    movesUci: ['e2e4', 'c7c6', 'd2d4', 'd7d5', 'b1c3', 'd5e4', 'c3e4', 'g8f6'],
  },
  {
    id: 'nimzo_indian',
    name: 'Nimzo-Indian Defense',
    eco: 'E20',
    description:
      'Against d4, Black develops the bishop to pin the knight and fight for the e4 square.',
    movesUci: ['d2d4', 'g8f6', 'c2c4', 'e7e6', 'b1c3', 'f8b4', 'e2e3', 'c7c5'],
  },
  {
    id: 'kings_indian',
    name: "King's Indian Defense",
    eco: 'E60',
    description:
      'Hypermodern setup: Black allows White the center, then strikes with ...e5 or ...c5.',
    movesUci: ['d2d4', 'g8f6', 'c2c4', 'g7g6', 'b1c3', 'f8g7', 'e2e4', 'd7d6'],
  },
]

export function getOpeningLine(id: string): OpeningLine {
  return OPENING_LINES.find((o) => o.id === id) ?? OPENING_LINES[0]
}
