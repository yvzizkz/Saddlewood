import type { ContractItem, DraftContractInput } from './types';

const CONTRACT_TITLES: Record<string, string> = {
  prime_residential: 'Prime Residential Construction Agreement',
  prime_commercial: 'Prime Commercial Construction Agreement',
  subcontractor: 'Subcontractor Trade Agreement',
};

export function generateContractText(
  params: Partial<ContractItem> | DraftContractInput,
  contractNo = 'SWC-2026-001'
): string {
  const contractType = params.type || 'prime_residential';
  const typeTitle = CONTRACT_TITLES[contractType] || 'Construction Agreement';
  const clientName = params.client_name || 'Client';
  const clientEntity = params.client_entity || clientName;
  const projectName =
    params.project_name ||
    (contractType === 'prime_residential' ? `${clientName} Residence` : `${clientName} Project`);
  const projectAddress = params.project_address || 'Project Jobsite Address';
  const contractAmount = Number(params.amount || 0);
  const depositAmount =
    params.deposit !== undefined ? Number(params.deposit) : contractAmount * 0.1;
  const scopeSummary = params.scope || 'Framing, drywall and finish carpentry';
  const scopeDetails = params.scope_details ? `\n${params.scope_details}\n` : '';
  const warrantyYears =
    params.warranty_years !== undefined
      ? params.warranty_years
      : contractType === 'prime_residential'
        ? 2
        : 1;
  const lateInterest = params.late_interest || '1.5% per month (18% per annum)';
  const remobFee =
    params.remobilization_fee !== undefined ? Number(params.remobilization_fee) : 1500.0;
  const dateStr =
    params.date ||
    new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

  const formattedAmount = contractAmount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const formattedDeposit = depositAmount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const formattedRemob = remobFee.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return `# ${typeTitle.toUpperCase()}
**Agreement No:** ${contractNo}
**Effective Date:** ${dateStr}

---

### PARTIES & PROJECT
This Agreement is entered into by and between:
* **Contractor:** Saddlewood Contracting LLC ("Saddlewood")
  ROC License: ROC338944 / ROC338945 · Phone: (602) 218-1191 · Email: info@saddlewoodcontracting.com
  Principal Address: Phoenix, AZ
* **Client / Owner:** ${clientName} (${clientEntity}) ("Client")
  Billing Contact: ${clientName} · Address: ${projectAddress}

**Project Name:** ${projectName}
**Project Location / Jobsite:** ${projectAddress}

---

### 1. SCOPE OF WORK
1.1. **Work Scope:** Saddlewood agrees to furnish the supervision, labor, tools, equipment, and materials reasonably necessary to perform the following specified work:
> **${scopeSummary}**
${scopeDetails}
1.2. **Exclusions from Scope:** Unless explicitly itemized above, the Contract Price does not include:
(a) Remediation of hazardous materials, asbestos, lead, mold, or preexisting environmental contaminants;
(b) Structural engineering, architectural stamp fees, or municipal utility tap fees;
(c) Concealed, latent, or subsurface conditions differing materially from visible conditions at bid time;
(d) Work performed by other trades, subcontractors, or utility companies not engaged by Saddlewood.

---

### 2. CONTRACT PRICE, DEPOSIT & PROGRESS BILLING
2.1. **Contract Price:** Client agrees to pay Saddlewood the total sum of **$${formattedAmount}** ("Contract Price"), subject to additions or deductions pursuant to written Change Orders.
2.2. **Deposit:** Upon execution of this Agreement, Client shall pay a non-refundable commencement deposit of **$${formattedDeposit}** prior to jobsite mobilization or ordering of custom materials.
2.3. **Progress Billing Cadence:** Progress payments shall be billed twice monthly (on or about the 1st and 15th calendar days of each month) based upon the percentage of work completed pursuant to the Schedule of Values.
2.4. **Payment Terms:** All progress payments and final billing are **due within seven (7) calendar days** from the invoice date.

---

### 3. LATE PAYMENT CONSEQUENCES & RIGHT TO SUSPEND WORK
3.1. **Late Interest:** Any invoice balance unpaid after ten (10) calendar days from the invoice date shall be delinquent and shall accrue finance interest at the rate of **${lateInterest}** (or the maximum statutory rate under state law) until paid in full.
3.2. **Notice of Intent to Suspend:** If Client fails to pay any progress billing when due, Saddlewood may serve a written **Five (5) Day Notice of Intent to Suspend Work**.
3.3. **Work Stoppage & Schedule Extension:** If payment is not received in cleared funds within five (5) business days following said notice:
  (a) Saddlewood may immediately stop all work on the project without default or breach;
  (b) The contract completion schedule shall be extended day-for-day for each day work is suspended;
  (c) Client shall pay a mandatory **$${formattedRemob} Remobilization Fee** prior to Saddlewood re-staffing the site.
3.4. **Collection & Legal Fees:** If Saddlewood engages an attorney, collection agency, or files arbitration/litigation to recover unpaid contract balances, Client shall reimburse Saddlewood for **all reasonable attorneys' fees, expert fees, court filing fees, and collection expenses incurred**, whether or not formal suit is filed.
3.5. **Prompt Payment Act Compliance:** This Agreement incorporates and is subject to the Arizona Prompt Payment Act (A.R.S. § 32-1129 et seq.) / California Civil Code § 8800 et seq., where applicable.

---

### 4. MANUFACTURER DEFECTS & EQUIPMENT NON-LIABILITY CARVE-OUT
4.1. **Installation & Workmanship Only:** Saddlewood warrants and guarantees solely its direct installation labor and workmanship.
4.2. **Manufacturer Warranty Pass-Through:** Any equipment, machinery, fixtures, components, or pre-manufactured items installed by Saddlewood—including without limitation **HVAC equipment (compressors, heat pumps, air handlers, condenser coils, refrigerant lines, thermostats), electrical switchgear, plumbing valves and fixtures, appliances, prefabricated structural panels, and pre-finished surfaces**—are warranted **solely and exclusively by their respective third-party manufacturers**.
4.3. **Absolute Carve-Out for Factory Defects:**
  (a) Saddlewood is **NOT LIABLE** for any defect, mechanical malfunction, factory assembly failure, refrigerant leak within manufacturer components, or design failure inherent to manufactured equipment.
  (b) Saddlewood does not provide any express or implied warranty of merchantability or fitness for a particular purpose for third-party manufactured equipment.
  (c) Client's sole and exclusive remedy for equipment failure or defect is against the manufacturer under the manufacturer's written warranty.
  (d) Saddlewood shall not be liable for any secondary, consequential, incidental, delay, or water/heat damages resulting from manufacturer defects or factory recalls.
4.4. **Owner-Supplied Materials & Equipment:** If Client supplies any equipment, fixtures, or materials:
  (a) Client is solely responsible for timely delivery, count, specification, defect inspection, and manufacturer warranties;
  (b) Saddlewood charges a standard 10% material handling and staging fee;
  (c) Any jobsite delay caused by late, missing, damaged, or defective owner-supplied items is compensable to Saddlewood as an owner delay.

---

### 5. LIMITED WORKMANSHIP WARRANTY & EXCLUSIONS
5.1. **Workmanship Warranty:** Saddlewood warrants that its installation work shall be free from defects in workmanship for a period of **${warrantyYears} year(s)** following Substantial Completion.
5.2. **Express Exclusions from Warranty:** This limited warranty does NOT cover:
  (a) Normal wear and tear, cosmetic weathering, or normal hairline shrinkage cracks in drywall, stucco, or framing timber;
  (b) Moisture, water intrusion, mold, or rot arising from exterior conditions, preexisting structures, or roofing/window assemblies installed by others;
  (c) Damage resulting from lack of standard owner maintenance (including routine HVAC filter changes, cleaning of condensate lines, or exterior drainage);
  (d) Damage caused by structural settlement, soil movement, earthquake, fire, or acts of God;
  (e) Any modification, alteration, or repair performed by Client or any third party without Saddlewood's prior written authorization.

---

### 6. CHANGE ORDER PROTOCOL (ZERO VERBAL CHANGES)
6.1. **Mandatory Written Change Orders:** No deviation, addition, deletion, or extra work shall be performed without a **formal written Change Order signed by both parties** specifying the added/deducted cost and schedule impact.
6.2. **Prohibition of Verbal Agreements:** Verbal requests, text messages without written price agreement, or field discussions do NOT constitute authorization. Saddlewood field leads are not authorized to waive this written requirement.
6.3. **Deposit on Major Change Orders:** For any Change Order with a gross value of $5,000.00 or greater, **fifty percent (50%) of the Change Order price is due and payable upon signature** prior to procurement or labor execution.
6.4. **Change Order Markup:** Extra work priced on a time-and-materials basis shall include a standard **20% Overhead and Profit markup**. Minor field extras under $1,000 shall be recorded on the job minor-extras log and billed on the immediate next progress invoice.

---

### 7. PRELIMINARY LIEN NOTICE & STATUTORY DISCLOSURES
7.1. **Administrative 20-Day Preliminary Notice:** Client acknowledges that pursuant to Arizona Revised Statutes (A.R.S. § 33-992.01) and applicable mechanics' lien statutes, Saddlewood routinely serves a **20-Day Preliminary Lien Notice** as a standard administrative business practice. Service of said notice is a required statutory preservation of lien rights and does not reflect upon Client's creditworthiness.
7.2. **Lien Waivers:** Saddlewood provides standard conditional progress lien waivers with each progress payment, and an unconditional final lien waiver upon receipt of final payment in full.

---

### 8. DISPUTE RESOLUTION & VENUE
8.1. **Direct Negotiation & Mediation:** In the event of any dispute arising out of this Agreement, the parties shall first meet within ten (10) days to resolve the matter in good faith. If unresolved, the dispute shall be submitted to mediation administered by the American Arbitration Association (AAA) prior to court proceedings.
8.2. **Governing Law & Venue:** This Agreement shall be construed in accordance with the laws of the State of Arizona. Exclusive venue for any legal action shall lie in the Superior Court of Maricopa County, Arizona.
8.3. **No Personal Guaranty / No Confession:** Saddlewood does not grant any personal guaranty or confession of judgment.

---

### SIGNATURES & ACCEPTANCE
The parties have executed this Agreement as of the date first written above.

**SADDLEWOOD CONTRACTING LLC**

By: _________________________________________  
Name: Marco Ochoa  
Title: Managing Member / Qualifier  
Date: ________________________  


**CLIENT / OWNER: ${clientEntity}**

By: _________________________________________  
Name: ${clientName}  
Title: Authorized Owner / Representative  
Date: ________________________  
`.trim();
}
