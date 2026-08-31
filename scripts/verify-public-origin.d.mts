export interface PublicOriginEvidence {
  label: string
  url: string
  status: number
  contentType: string | null
}

export interface PublicOriginVerification {
  origin: string
  evidence: PublicOriginEvidence[]
}

export function parsePublicOrigin(candidate: string | undefined): string

export function verifyPublicOrigin(options?: {
  origin?: string
  fetchImpl?: typeof fetch
}): Promise<PublicOriginVerification>
