import {deepEqual} from 'fast-equals';
import {useEffect, useMemo, useRef} from 'react';
import type {OnyxCollection} from 'react-native-onyx';
import type {ValueOf} from 'type-fest';
import {useBetas} from '@components/OnyxProvider';
import * as ReportActionsUtils from '@libs/ReportActionsUtils';
import * as ReportUtils from '@libs/ReportUtils';
import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';
import type {ReportAction, TransactionViolation} from '@src/types/onyx';
import type Policy from '@src/types/onyx/Policy';
import type Report from '@src/types/onyx/Report';
import useActiveWorkspace from './useActiveWorkspace';

const collator = new Intl.Collator('en', {sensitivity: 'base', usage: 'sort'});

const compareReportNames = (a: Report, b: Report) => {
    if (!a.displayName || !b.displayName) {
        return 0;
    }
    return collator.compare(a.displayName.toLowerCase(), b.displayName.toLowerCase());
};

const compareReportDates = (a: Report, b: Report) => {
    if (!a.lastVisibleActionCreated || !b.lastVisibleActionCreated) {
        return 0;
    }
    if (a.lastVisibleActionCreated < b.lastVisibleActionCreated) {
        return -1;
    }
    if (a.lastVisibleActionCreated > b.lastVisibleActionCreated) {
        return 1;
    }
    return 0;
};

const isPinnedOrGBRReport = (report: Report) => {
    if (!report || !report.isPinned) {
        return false;
    }
    const reportAction = ReportActionsUtils.getReportAction(report.parentReportID ?? '', report.parentReportActionID ?? '');
    return ReportUtils.requiresAttentionFromCurrentUser(report, reportAction);
};

const useOrderedReportIDs = (
    currentReportId: string | null,
    allReports: Record<string, Report>,
    policies: Record<string, Policy>,
    priorityMode: ValueOf<typeof CONST.PRIORITY_MODE>,
    allReportActions: OnyxCollection<ReportAction[]>,
    transactionViolations: OnyxCollection<TransactionViolation[]>,
    policyMemberAccountIDs: number[] = [],
) => {
    const reportIDsRef = useRef<string[]>([]);
    const currentReportIDRef = useRef(currentReportId);
    const betas = useBetas();
    const {activeWorkspaceID} = useActiveWorkspace();

    // We need to make sure the current report is in the list of reports, but we do not want
    // to have to re-generate the list every time the currentReportID changes. To do that,
    // we first generate the list as if there was no current report, then here we check if
    // the current report is missing from the list, which should very rarely happen. In this
    //  case, we re-generate the list a 2nd time with the current report included.
    const currentActiveReportId = useMemo(() => {
        if (currentReportId && !reportIDsRef.current.includes(currentReportId)) {
            currentReportIDRef.current = currentReportId;
        }
        return currentReportIDRef.current;
    }, [currentReportId]);

    const isInGSDMode = priorityMode === CONST.PRIORITY_MODE.GSD;

    const allReportsDictValues = useMemo(() => Object.values(allReports), [allReports]);

    const reportsWithViolation = useMemo(
        () =>
            !betas.includes(CONST.BETAS.VIOLATIONS)
                ? []
                : Object.keys(allReports).filter((reportID) => {
                      const report = allReports[reportID];
                      const parentReportActionsKey = `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${report?.parentReportID}`;
                      const parentReportActions = allReportActions?.[parentReportActionsKey];
                      if (!report || !parentReportActions) {
                          return false;
                      }
                      const parentReportAction = parentReportActions.find((action) => action && report && action?.reportActionID === report?.parentReportActionID);
                      return !!parentReportAction && ReportUtils.doesTransactionThreadHaveViolations(report, transactionViolations, parentReportAction);
                  }),
        [allReportActions, allReports, betas, transactionViolations],
    );

    const conciergeChatReport = useMemo(() => allReportsDictValues.find(ReportUtils.isConciergeChatReport), [allReportsDictValues]);

    // Filter out all the reports that shouldn't be displayed
    const filteredReportsToDisplay = useMemo(() => {
        const reportsLHN = allReportsDictValues.filter((report) =>
            ReportUtils.shouldReportBeInOptionList({
                report,
                currentReportId: currentActiveReportId ?? '',
                isInGSDMode,
                betas,
                policies,
                excludeEmptyChats: true,
                doesReportHaveViolations: !!report.reportID && reportsWithViolation.includes(report.reportID),
            }),
        );
        // Display Concierge chat report when there is no report to be displayed
        if (reportsLHN.length === 0 && conciergeChatReport) {
            return [conciergeChatReport];
        }
        return reportsLHN;
    }, [allReportsDictValues, betas, conciergeChatReport, currentActiveReportId, isInGSDMode, policies, reportsWithViolation]);

    const reportsToDisplay: Report[] = useMemo(() => {
        if (!!activeWorkspaceID || policyMemberAccountIDs.length > 0) {
            return filteredReportsToDisplay.filter((report) => ReportUtils.doesReportBelongToWorkspace(report, policyMemberAccountIDs, activeWorkspaceID));
        }
        return filteredReportsToDisplay;
    }, [activeWorkspaceID, policyMemberAccountIDs, filteredReportsToDisplay]);

    const {pinnedAndGBRReports, draftReports, nonArchivedReports, archivedReports} = useMemo(() => {
        const pinnedAndGBRReportsLocal: Report[] = [];
        const draftReportsLocal: Report[] = [];
        const nonArchivedReportsLocal: Report[] = [];
        const archivedReportsLocal: Report[] = [];
        reportsToDisplay?.forEach((report) => {
            // Normally, the spread operator would be used here to clone the report and prevent the need to reassign the params.
            // However, this code needs to be very performant to handle thousands of reports, so in the interest of speed, we're just going to disable this lint rule and add
            // the reportDisplayName property to the report object directly.
            // eslint-disable-next-line no-param-reassign
            report.displayName = ReportUtils.getReportName(report);

            if (isPinnedOrGBRReport(report)) {
                pinnedAndGBRReportsLocal.push(report);
            } else if (report.hasDraft) {
                draftReportsLocal.push(report);
            } else if (ReportUtils.isArchivedRoom(report)) {
                archivedReportsLocal.push(report);
            } else {
                nonArchivedReportsLocal.push(report);
            }
        });
        return {
            pinnedAndGBRReports: pinnedAndGBRReportsLocal,
            draftReports: draftReportsLocal,
            nonArchivedReports: nonArchivedReportsLocal,
            archivedReports: archivedReportsLocal,
        };
    }, [reportsToDisplay]);

    // Sort each group of reports accordingly
    const sortedPinnedAndGBRReports = useMemo(() => pinnedAndGBRReports.sort(compareReportNames), [pinnedAndGBRReports]);
    const sortedDraftReports = useMemo(() => draftReports.sort(compareReportNames), [draftReports]);

    const sortedNonArchivedReports = useMemo(
        () => nonArchivedReports.sort((a, b) => (!isInGSDMode && compareReportDates(b, a)) || compareReportNames(a, b)),
        [isInGSDMode, nonArchivedReports],
    );
    const sortedArchivedReports = useMemo(
        () => archivedReports.sort((a, b) => (!isInGSDMode ? compareReportDates(b, a) : compareReportNames(a, b))),
        [archivedReports, isInGSDMode],
    );

    useEffect(() => {
        // Now that we have all the reports grouped and sorted, they must be flattened into an array and only return the reportID.
        // The order the arrays are concatenated in matters and will determine the order that the groups are displayed in the sidebar.
        const reportIDs = [...sortedPinnedAndGBRReports, ...sortedDraftReports, ...sortedNonArchivedReports, ...sortedArchivedReports].map((report) => report.reportID);

        if (deepEqual(reportIDsRef, reportIDs)) {
            return;
        }
        reportIDsRef.current = reportIDs;
    }, [sortedArchivedReports, sortedDraftReports, sortedNonArchivedReports, sortedPinnedAndGBRReports]);

    return reportIDsRef.current.length > 0 ? reportIDsRef.current : null;
};

export default useOrderedReportIDs;
