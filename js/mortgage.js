// חישובי משכנתא: לוח שפיצר, קרן שווה, יחס מימון ויחס החזר.
const Mortgage = {
  // החזר חודשי בשיטת שפיצר (תשלום קבוע)
  spitzerPayment(principal, annualRatePct, years) {
    const n = Math.round(years * 12);
    const r = annualRatePct / 100 / 12;
    if (!principal || !n) return 0;
    if (r === 0) return principal / n;
    return principal * r / (1 - Math.pow(1 + r, -n));
  },

  // תשלום ראשון בשיטת קרן שווה
  equalPrincipalFirstPayment(principal, annualRatePct, years) {
    const n = Math.round(years * 12);
    if (!principal || !n) return 0;
    return principal / n + principal * (annualRatePct / 100 / 12);
  },

  totalPaid(principal, annualRatePct, years) {
    return this.spitzerPayment(principal, annualRatePct, years) * Math.round(years * 12);
  },

  // יחס מימון (LTV)
  ltv(loan, propertyValue) {
    return propertyValue ? (loan / propertyValue) * 100 : 0;
  },

  // יחס החזר מההכנסה (PTI)
  pti(monthlyPayment, monthlyIncome) {
    return monthlyIncome ? (monthlyPayment / monthlyIncome) * 100 : 0;
  },

  // תקרות מימון לפי הנחיות בנק ישראל (הנחיה כללית בלבד)
  maxLtvByPurpose: {
    'דירה ראשונה': 75,
    'דירה חלופית': 70,
    'דירה להשקעה': 50,
    'מחזור משכנתא': 75,
    'משכנתא לכל מטרה': 50,
    'בנייה עצמית': 75,
  },

  PTI_RECOMMENDED: 33,
  PTI_MAX: 50,
};

if (typeof module !== 'undefined') module.exports = Mortgage;
