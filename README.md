# CBG Operations Dashboard

One website that replaces three Power BI reports:

| Section | Replaces | Pages |
|---|---|---|
| Brewing | CBG_Brewing_Process_2026.pbix | Brewing Performance YTD |
| Supply Chain Rundown | CBG_Supply_Chain_Rundown_2026.pbix | Downtime at a glance, Downtime analytics, 3-year downtime, Failure modes, Production efficiency, Packaging loss, Packaging by shift, 3-year packaging loss, Daily bottling, Cost vs performance, Production KPIs, 3-year brewing loss |
| KPI Scorecard | KPI_Model.pbix | Scorecard, KPI trends, Production and loss, Utilities monthly, Utilities weekly, Quality and complaints, Cost, Forecast, Cases produced, Actual vs budget |

Every page has filters (tick one or several months, years, brands and so on), and **Generate report** builds a printable report from any pages you pick.

## Updating the figures

1. Update the workbook the same way you do for Power BI today (for example `CBG_KPI_Monthly_2026.xlsx`).
2. In GitHub open **data/raw**, choose **Add file → Upload files**, drop the workbook in and click **Commit changes**.
3. About two minutes later the website shows the new figures. **data/build-report.txt** lists what was read from each file.

Notes:
- Uploading a file with the same name replaces the old copy. A copy with a different name also works: for the same year, the most recently uploaded file wins.
- A workbook for a new year (for example `CBG_KPI_Monthly_2027.xlsx`) is added alongside the 2026 one, so the year filters show both.
- Sheets are found by their name (for example `Scorecard_Monthly`). A renamed sheet is still found if its header row has all the usual columns.
- Shift reports (`Average cases per hr-shift 2026(MAY).csv`, or the same layout in Excel) can be added month by month; they all appear on the **Packaging by shift** page.
- Production efficiency, Packaging loss and Production KPIs are built from the raw workbooks (Gross Efficiency, Daily Process Reports, OEE, FTR, PM compliance, Utilities Tracking). Product names in Gross Efficiency are grouped into families with `scripts/product-map.json`; a new spelling is shown under its own name and listed in `data/build-report.txt` so it can be added there.
- Downtime (at a glance, analytics, failure modes) comes straight from **GBL_Line_Downtime_2026.xlsx**, and Daily bottling from **Daily_Bottling_Summary_2026.xlsx**. Upload the same workbook again each month. Downtime categories are grouped into buckets with `scripts/downtime-buckets.json`.
- The monthly **SCTCM report** (`CBG - SCTCM report [Month] 2026 (Supply chain).pptx`) is read from its KPI scorecard slide. Each report replaces that one month on the Scorecard, KPI trends, Production and loss, Cases produced and Production KPIs pages, and gives plant availability and last-year figures. The charts in the report are pictures and cannot be read.
- A month with no SCTCM report yet is worked out from the raw files (Gross Efficiency, Daily Process Report, Utilities Tracking, OEE, FTR, PM compliance) and marked as such on the Scorecard. Plant availability and the bottling detail KPIs only appear once that month's SCTCM report is uploaded.
- Utilities come straight from the monthly **Utilities Tracking** workbooks (the same files the CBG dashboard uses). Upload each month's file; weeks are days 1–7, 8–14, 15–21, 22–28 and 29 to month end. `CBG_Utilities_Weekly_2026.xlsx` is no longer needed; if it is uploaded, the tracking workbooks still take priority.

## Which workbook feeds which page

| Workbook | Sheets used | Pages |
|---|---|---|
| CBG_YTD_Brewing_Model_2026.xlsx | FactYTDBrews table | Brewing Performance YTD |
| GBL_Line_Downtime_2026.xlsx (raw) | Monthly summary loss, the month sheets and the detail sheets | Downtime at a glance, Downtime analytics, Failure modes |
| CBG - SCTCM report [Month] 2026 (Supply chain).pptx (raw, monthly) | KPI scorecard slide | Scorecard, KPI trends, Production and loss, Cases produced, Actual vs budget, Production KPIs |
| GBL_3Year_Downtime_Model.xlsx | Fact_Downtime_3Yr, Dim_Category | 3-year downtime |
| Gross_Efficiency_2026.xlsx (raw) | one row per production run | Production efficiency, Packaging loss, Production KPIs (cases, bottling loss) |
| GBL_Efficiency_Model.xlsx | Fact_Efficiency | Production efficiency, 2025 only (2026 comes from Gross Efficiency) |
| Daily_Bottling_Summary_2026.xlsx (raw) | one sheet per month (Jan_26, Feb_26 …) | Daily bottling |
| CBG_Cost_Comparison_2026.xlsx | Cost_Ops_Comparison | Cost vs performance, Production efficiency (cost per case) |
| CaribBrewery_PackagingLoss_Model.xlsx | Fact_Packaging, Dim_LossBand | Packaging loss, 2025 only (2026 comes from Gross Efficiency) |
| Average cases per hr-shift … .csv | the shift sheet | Packaging by shift |
| CBG_Packaging_Loss_3Yr.xlsx | Pkg_Loss_3Yr | 3-year packaging loss |
| CBG_Brewing_Loss_3Yr.xlsx | Brew_Loss_3Yr | 3-year brewing loss |
| [Month]_26_Daily_Process_Report_2026.xlsx (raw, monthly) | Process Loss (Volume), brewing, brews per day tables | Production KPIs (process loss, extract recovery, brews per day) |
| CBG_OEE_(Availability_and_Utilization)_Calculation-_2026.xlsx (raw) | Summary | Production KPIs (OEE) |
| FTR_Calculations_2026.xlsx (raw) | Summary Report | Production KPIs (FTR) |
| Finished PM Compliance.xlsx (raw) | monthly % completion | Production KPIs (maintenance compliance) |
| CBG_Production_KPIs_2026.xlsx | Production_KPIs | Production KPIs: plant availability for months without an SCTCM report (optional) |
| CBG_KPI_Monthly_2026.xlsx | Scorecard_Monthly | Scorecard and KPI trends for months before the SCTCM reports start (January to July 2026) |
| CBG_Supply_KPI_Model_2026.xlsx | Fact_ExtractLoss, Fact_Complaints, Fact_ComplaintsBrand, Fact_Forecast, Fact_Export, Fact_CostPerCase, Fact_CostPerCaseMonthly | Production and loss, Quality and complaints, Cost, Forecast |
| CBG_Brewing_KPIs_Monthly_2026.xlsx | Fact_BrewsPerDay_Monthly | Production and loss, January to July 2026 |
| [Month]_26_Utilities_Tracking.xlsx (one per month, raw) | Utility Analysis [Month] [Year] | Utilities monthly, Utilities weekly |
| CBG_Cases_Produced_2026.xlsx | Cases_Monthly, Cases_By_Brand | Cases produced, Actual vs budget |

No longer needed for 2026 (the raw files above replace them; they are still read for earlier years if uploaded): GBL_Downtime_Dashboard.xlsx, CaribBrewery_PlanAttainment_Model.xlsx, GBL_Failure_Modes.xlsx, GBL_DailyBottling_Model.xlsx.

## Setting up the repository (once)

1. Create a new **private** repository (for example `cbggrenada/operations`) and upload everything in this folder, including the hidden `.github` folder.
2. **Settings → Pages → Source: GitHub Actions.**
3. Open **Actions → Update dashboard → Run workflow** for the first build.

## Files

- `index.html` – the dashboard (also works when opened straight from a computer, using the copy of the data saved inside it)
- `data/raw/` – the workbooks
- `data/ops-data.json`, `data/ops-data.js`, `data/build-report.txt` – written by the build, do not edit
- `scripts/build-data.js`, `scripts/schema.json` – the build, and the list of sheets and columns it reads
- `src/` – the dashboard source; `python3 assemble.py` turns it into `index.html`
- `.github/workflows/update-dashboard.yml` – runs the build on every upload
