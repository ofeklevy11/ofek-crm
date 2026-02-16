"use server";

import { prisma as db } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/permissions-server";
import { revalidatePath } from "next/cache";

export interface BusinessSettings {
  businessType: string | null;
  taxId: string | null;
  businessAddress: string | null;
  businessWebsite: string | null;
  businessEmail: string | null;
  logoUrl: string | null;
  name: string;
}

export async function getBusinessSettings(): Promise<BusinessSettings | null> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");

  const company = await db.company.findUnique({
    where: { id: user.companyId },
    select: {
      name: true,
      businessType: true,
      taxId: true,
      businessAddress: true,
      businessWebsite: true,
      businessEmail: true,
      logoUrl: true,
    },
  });

  return company;
}

export async function updateBusinessSettings(data: {
  name: string;
  businessType: string;
  taxId: string;
  businessAddress: string;
  businessWebsite?: string;
  businessEmail?: string;
  logoUrl?: string;
}) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  if (user.role !== "admin") throw new Error("Only admins can update business settings");

  const company = await db.company.update({
    where: { id: user.companyId },
    data: {
      name: data.name,
      businessType: data.businessType,
      taxId: data.taxId,
      businessAddress: data.businessAddress,
      businessWebsite: data.businessWebsite || null,
      businessEmail: data.businessEmail || null,
      logoUrl: data.logoUrl || null,
    },
  });

  revalidatePath("/quotes");
  revalidatePath("/quotes/new");
  revalidatePath("/settings");

  return company;
}

export async function checkBusinessSettingsComplete(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;

  const company = await db.company.findUnique({
    where: { id: user.companyId },
    select: {
      businessType: true,
      taxId: true,
      businessAddress: true,
    },
  });

  if (!company) return false;

  // Check if required fields are filled
  return Boolean(
    company.businessType && company.taxId && company.businessAddress
  );
}
