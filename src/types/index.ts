export interface GatewayConfig {
  graphmanHome: string;
  sourceGateway: string;
  targetGateway: string;
  assertionType: string;
  exportSchema: string;
  importSchema: string;
}

export interface SearchResult {
  type: 'Service' | 'Policy';
  name: string;
  resolutionPath: string;
  folderPath: string;
  exists: boolean;
  policyDetails?: unknown;
}

export interface SearchResultsData {
  timestamp: string;
  inputFile: string;
  hostname: string;
  searchAssertion: string;
  totalServices: number;
  totalPolicies: number;
  totalItems: number;
  itemsWithAssertion: number;
  results: SearchResult[];
}

export interface ResultsFile {
  name: string;
  modified: string;
}

export interface InputDataStats {
  exists: boolean;
  services: number;
  policies: number;
  total: number;
  hostname: string;
}

export interface ComplianceItem {
  type: string;
  name: string;
  folderPath: string;
  resolutionPath: string;
}

export interface ComplianceAssertionResult {
  assertion: string;
  count: number;
  items: ComplianceItem[];
}

export interface ComplianceReport {
  success: boolean;
  hostname: string;
  timestamp: string;
  totalServices: number;
  totalPolicies: number;
  results: ComplianceAssertionResult[];
}

export interface Certificate {
  id: number;
  name: string;
  subjectDn: string;
  issuerDn: string;
  notBefore: string | null;
  notAfter: string | null;
  thumbprintSha1: string;
  type: string;
  enabled: boolean;
}

export interface CertificatesData {
  exists: boolean;
  hostname: string;
  certificates: Certificate[];
}

export interface BundleFile {
  name: string;
  size: number;
  modified: string;
}

export interface EncassConfig {
  name: string;
  description: string;
  policyName: string;
  guid: string;
}

export interface EncassConfigsResponse {
  exists: boolean;
  hostname: string;
  configs: EncassConfig[];
}

export interface ComplianceRow {
  type: 'Service' | 'Policy';
  name: string;
  resolutionPath: string;
  folderPath: string;
  compliant: boolean;
}

export interface EncassComplianceReport {
  success: boolean;
  hostname: string;
  timestamp: string;
  encassName: string;
  totalServices: number;
  totalPolicies: number;
  totalItems: number;
  compliantCount: number;
  nonCompliantCount: number;
  results: ComplianceRow[];
}
