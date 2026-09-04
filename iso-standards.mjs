/**
 * Shared ISO/IEC standards catalogue.
 *
 * Single source of truth for the standards and per-standard controls that both
 * the deterministic artefact audit (iso-local-audit.mjs) and the Claude-driven
 * agent (iso-agent.mjs) assess. Each standard has an id and 5 controls; a
 * control is a plain-English description of the evidence a compliant project is
 * expected to be able to show.
 */
export const STANDARDS = [
  { id: 'ISO/IEC/IEEE 12207:2017', title: 'Software life cycle processes', checks: ['requirements documentation (README, REQUIREMENTS.md, specs/)', 'design documents or architecture files', 'change management (CHANGELOG, git history)', 'maintenance and support documentation', 'software development plan or project plan'] },
  { id: 'ISO/IEC/IEEE 15288:2023', title: 'System life cycle processes', checks: ['system requirements specification', 'architecture definition documents', 'system integration plan', 'stakeholder needs documentation', 'deployment and operations documentation'] },
  { id: 'ISO/IEC 5338:2023', title: 'AI system life cycle processes', checks: ['data management documentation (data sources, preprocessing)', 'model development documentation', 'training and validation procedures', 'AI system integration documentation', 'monitoring and drift detection plans'] },
  { id: 'ISO/IEC/IEEE 29119-2:2021', title: 'Software testing — test processes', checks: ['test plan document', 'test management process documentation', 'test design process evidence', 'test execution records or CI configuration', 'test completion criteria'] },
  { id: 'ISO/IEC/IEEE 29119-3:2021', title: 'Software testing — test documentation', checks: ['test cases or test scripts', 'test execution logs', 'defect or issue tracking evidence', 'test summary reports', 'test coverage reports'] },
  { id: 'ISO/IEC/IEEE 29119-4:2021', title: 'Software testing — test techniques', checks: ['evidence of boundary value analysis or equivalence partitioning', 'unit tests with code coverage', 'integration tests', 'system or end-to-end tests', 'documented test design rationale'] },
  { id: 'ISO/IEC 25010:2023', title: 'Product quality model', checks: ['security controls or security scanning config', 'performance benchmarks or load tests', 'reliability testing (fault tolerance, recovery)', 'maintainability measures (linting, code quality tools)', 'compatibility documentation'] },
  { id: 'ISO/IEC 25012:2008', title: 'Data quality model', checks: ['data validation logic or schema definitions', 'data accuracy checks', 'data completeness checks', 'data consistency enforcement', 'data lineage or provenance documentation'] },
  { id: 'ISO/IEC 25059:2023', title: 'Quality model for AI systems', checks: ['model accuracy metrics and evaluation', 'explainability documentation', 'AI adaptability and update procedures', 'autonomous behaviour documentation', 'AI safety constraints documentation'] },
  { id: 'ISO 5055:2021', title: 'Automated source code quality measures', checks: ['static analysis tool configuration (eslint, sonarqube, pylint, etc.)', 'security weakness scanning', 'performance anti-pattern checks', 'maintainability index tracking', 'automated quality gates in CI/CD'] },
  { id: 'ISO/IEC 42001:2023', title: 'AI management system', checks: ['AI governance policy documentation', 'AI risk assessment records', 'AI impact assessment documentation', 'third-party AI tool inventory', 'AI monitoring and audit procedures'] },
  { id: 'ISO/IEC 23894:2023', title: 'AI risk management', checks: ['AI-specific risk register', 'bias and fairness assessment', 'privacy risk assessment for AI', 'safety risk documentation', 'risk monitoring and review procedures'] },
  { id: 'ISO/IEC TR 24028:2020', title: 'Trustworthiness in AI', checks: ['model robustness testing', 'adversarial testing evidence', 'transparency documentation (model cards)', 'fairness metrics and evaluation', 'privacy protection measures for AI data'] },
  { id: 'ISO/IEC 42005:2025', title: 'AI system impact assessment', checks: ['societal impact assessment document', 'individual rights impact analysis', 'foreseeable misuse analysis', 'lifecycle impact monitoring plan', 'transparency and accountability measures'] },
  { id: 'ISO/IEC 27001:2022', title: 'Information security management', checks: ['security policy documentation', 'access control configuration or documentation', 'incident response plan', 'vulnerability management (dependency scanning, CVE tracking)', 'supplier/third-party security assessment'] },
  { id: 'ISO/IEC 27005:2022', title: 'Information security risk management', checks: ['risk identification and register', 'risk analysis methodology', 'risk treatment plan', 'residual risk documentation', 'risk communication and review schedule'] },
  { id: 'ISO/IEC 31700:2023', title: 'Privacy by design', checks: ['privacy policy or data protection documentation', 'data minimisation practices (only collect necessary data)', 'user consent mechanisms', 'data retention and deletion procedures', 'GDPR or privacy regulation compliance evidence'] },
  { id: 'ISO/IEC/IEEE 29148:2018', title: 'Requirements engineering', checks: ['stakeholder requirements document', 'system requirements specification', 'software requirements specification', 'requirements traceability matrix', 'requirements validation evidence'] },
  { id: 'ISO 9001:2015', title: 'Quality management systems', checks: ['quality policy documentation', 'process documentation and procedures', 'performance monitoring metrics', 'continual improvement evidence (retrospectives, post-mortems)', 'customer/user feedback processes'] },
];
