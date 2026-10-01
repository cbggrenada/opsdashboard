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
- Utilities come straight from the monthly **Utilities Tracking** workbooks (the same files the CBG dashboard uses). Upload each month's file; weeks are days 1–7, 8–14, 15–21, 22–28 and 29 to month end. `CBG_Utilities_Weekly_2026.xlsx` is no longer needed; if it is uploaded, the tracking workbooks still take priority.

## Which workbook feeds which page

| Workbook | Sheets used | Pages |
|---|---|---|
| CBG_YTD_Brewing_Model_2026.xlsx | FactYTDBrews table | Brewing Performance YTD |
| CaribBrewery_PlanAttainment_Model.xlsx | YTD_Summary, Equipment_Pareto | Downtime at a glance |
| GBL_Downtime_Dashboard.xlsx | Fact_Downtime, Daily_2Week, Pareto_2Week, Dim_Category | Downtime at a glance, Downtime analytics |
| GBL_3Year_Downtime_Model.xlsx | Fact_Downtime_3Yr, Dim_Category | 3-year downtime |
| GBL_Failure_Modes.xlsx | Failure_Modes | Failure modes |
| GBL_Efficiency_Model.xlsx | Fact_Efficiency | Production efficiency |
| GBL_DailyBottling_Model.xlsx | Fact_Bottling | Production efficiency, Daily bottling |
| CBG_Cost_Comparison_2026.xlsx | Cost_Ops_Comparison | Cost vs performance, Production efficiency (cost per case) |
| CaribBrewery_PackagingLoss_Model.xlsx | Fact_Packaging, Dim_LossBand | Packaging loss |
| Average cases per hr-shift … .csv | the shift sheet | Packaging by shift |
| CBG_Packaging_Loss_3Yr.xlsx | Pkg_Loss_3Yr | 3-year packaging loss |
| CBG_Brewing_Loss_3Yr.xlsx | Brew_Loss_3Yr | 3-year brewing loss |
| CBG_Production_KPIs_2026.xlsx | Production_KPIs | Production KPIs |
| CBG_KPI_Monthly_2026.xlsx | Scorecard_Monthly | Scorecard, KPI trends, Utilities monthly |
| CBG_Supply_KPI_Model_2026.xlsx | Fact_ExtractLoss, Fact_Complaints, Fact_ComplaintsBrand, Fact_Forecast, Fact_Export, Fact_CostPerCase, Fact_CostPerCaseMonthly | Production and loss, Quality and complaints, Cost, Forecast |
| CBG_Brewing_KPIs_Monthly_2026.xlsx | Fact_BrewsPerDay_Monthly | Production and loss |
| [Month]_26_Utilities_Tracking.xlsx (one per month, raw) | Utility Analysis [Month] [Year] | Utilities monthly, Utilities weekly |
| CBG_Cases_Produced_2026.xlsx | Cases_Monthly, Cases_By_Brand | Cases produced, Actual vs budget |

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
