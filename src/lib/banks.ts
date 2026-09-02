// Bancos e instituciones financieras que operan en El Salvador (actualizado).
// Se usa para seleccionar el banco destino al registrar un pago a proveedor.
export const EL_SALVADOR_BANKS = [
  "Banco Agrícola",
  "Banco Cuscatlán",
  "Banco Davivienda",
  "Banco de América Central (BAC)",
  "Banco Hipotecario",
  "Banco de Fomento Agropecuario (BFA)",
  "Banco Promerica",
  "Banco Azul",
  "Banco Atlántida",
  "Banco Industrial El Salvador",
  "Abank",
  "Banco Azteca",
  "Banco Mercantil (Inbursa)",
  "N1co",
  "Credicomer",
  "Multi Inversiones (MUFG financiera)",
  "Apoyo Integral",
  "Sociedad de Ahorro y Crédito Constelación",
  "FEDECRÉDITO / Caja de Crédito",
  "FEDECACES / Cooperativa",
  "Otro",
] as const;

export type BankAccountType = "ahorro" | "corriente";

export interface BankAccount {
  bank: string;
  account_number: string;
  account_type: BankAccountType;
  holder_name: string;
}
