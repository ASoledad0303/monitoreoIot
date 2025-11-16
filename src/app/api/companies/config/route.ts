import { NextResponse } from "next/server";
import { COMPANY_CONFIG } from "@/lib/config";

/**
 * Obtiene la configuración de companies (para el cliente)
 * GET /api/companies/config
 */
export async function GET() {
  return NextResponse.json({
    enabled: COMPANY_CONFIG.ENABLED,
  });
}

