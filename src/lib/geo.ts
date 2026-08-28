// Countries + departments/states for experience location. El Salvador is fully
// listed (the launch market); other countries are here for market expansion and
// fall back to a free-text department field until their divisions are added.

export interface Country {
  code: string;
  name: string;
  departments: string[]; // empty => free-text department input
}

export const COUNTRIES: Country[] = [
  {
    code: "SV",
    name: "El Salvador",
    departments: [
      "Ahuachapán",
      "Santa Ana",
      "Sonsonate",
      "Chalatenango",
      "La Libertad",
      "San Salvador",
      "Cuscatlán",
      "La Paz",
      "Cabañas",
      "San Vicente",
      "Usulután",
      "San Miguel",
      "Morazán",
      "La Unión",
    ],
  },
  { code: "GT", name: "Guatemala", departments: [] },
  { code: "HN", name: "Honduras", departments: [] },
  { code: "NI", name: "Nicaragua", departments: [] },
  { code: "CR", name: "Costa Rica", departments: [] },
  { code: "PA", name: "Panamá", departments: [] },
  { code: "MX", name: "México", departments: [] },
];

export function departmentsOf(countryName?: string): string[] {
  return COUNTRIES.find((c) => c.name === countryName)?.departments ?? [];
}
