/* eslint-disable @typescript-eslint/no-unsafe-return */
import {useCallback, useEffect, useMemo, useRef} from 'react';
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

const isReportAvailable = (report: Report) => !(!report?.reportID ||
        !report?.type ||
        report?.reportName === undefined ||
        !!report?.isHidden ||
        !!report?.participantAccountIDs?.includes(CONST.ACCOUNT_ID.NOTIFICATIONS) ||
        (report?.participantAccountIDs?.length === 0 &&
            !ReportUtils.isChatThread(report) &&
            !ReportUtils.isPublicRoom(report) &&
            !ReportUtils.isUserCreatedPolicyRoom(report) &&
            !ReportUtils.isArchivedRoom(report) &&
            !ReportUtils.isMoneyRequestReport(report) &&
            !ReportUtils.isTaskReport(report)));

const collator = new Intl.Collator('en', {sensitivity: 'base', usage: 'sort'});

const compareReportNames = (a: Report, b: Report) => {
    if (!a?.displayName || !b?.displayName) {
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

type IDS = {
    pinnedOrGBRReportsIDs: string;
    archivedReportsIDs: string;
    draftReportsIDs: string;
};

const useOrderedReportIDs = (
    currentReportId: string | null,
    allReports: Record<string, Report>,
    policies: Record<string, Policy>,
    priorityMode: ValueOf<typeof CONST.PRIORITY_MODE>,
    allReportActions: OnyxCollection<ReportAction[]>,
    transactionViolations: OnyxCollection<TransactionViolation[]>,
    ids: IDS,
    policyMemberAccountIDs: number[] = [],
) => {
    const reportIDsRef = useRef<string[]>([]);
    const currentReportIDRef = useRef(currentReportId);
    const betas = useBetas();
    const {activeWorkspaceID} = useActiveWorkspace();
    const conciergeChatReport = useRef<Report | undefined>(undefined);


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

    useEffect(() => {
        if (conciergeChatReport.current) {
            return;
        }
        conciergeChatReport.current = allReportsDictValues.find(ReportUtils.isConciergeChatReport);
    }, [allReportsDictValues]);

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

    const isLinkedToWorkspace = useCallback(
        (report: Report) => !!activeWorkspaceID || policyMemberAccountIDs.length > 0 ? ReportUtils.doesReportBelongToWorkspace(report, policyMemberAccountIDs, activeWorkspaceID) : true,
        [activeWorkspaceID, policyMemberAccountIDs]
    );

    const excludedReports = useMemo(
        () => [
            ...ids.archivedReportsIDs,
            ...ids.draftReportsIDs,
            ...ids.pinnedOrGBRReportsIDs
        ].join(','),
        [ids]
    )

    // Filter out all the reports that shouldn't be displayed
    const reportsToDisplay = useMemo(() => {
        const start = performance.now();
        const reportsLHN = allReportsDictValues.filter((report) => report?.reportID && !excludedReports.includes(report.reportID) &&
            ReportUtils.shouldReportBeInOptionList({
                report,
                currentReportId: currentActiveReportId ?? '',
                isInGSDMode,
                betas,
                policies,
                excludeEmptyChats: true,
                doesReportHaveViolations: !!report.reportID && reportsWithViolation.includes(report.reportID),
            }) && isLinkedToWorkspace(report),
        );
        // Display Concierge chat report when there is no report to be displayed
        if (reportsLHN.length === 0 && conciergeChatReport.current) {
            return [conciergeChatReport.current];
        }

        const end = performance.now();
        console.log(`Execution time: reportsToDisplay: ${end - start} ms`);
        return reportsLHN;
    }, [allReportsDictValues, betas, currentActiveReportId, excludedReports, isInGSDMode, isLinkedToWorkspace, policies, reportsWithViolation]);


    // Sort each group of reports accordingly
    // const sortedPinnedAndGBRReports = useMemo(
    //     () => pinnedAndGBRReports.sort(compareReportNames).map((report) => report.reportID), 
    //     [pinnedAndGBRReports]
    // );

    const sortReports = useCallback(
        (iDs: string) => iDs.split(',')
        .map(id => {
            const report = allReports[`report_${id}`];                
            return report && isReportAvailable(report) && ReportUtils.canAccessReport(report, policies, betas) 
            ? report : null
        })
        .filter(report => report && isLinkedToWorkspace(report))
        .sort(compareReportNames)
        .map((report) => report?.reportID),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [policies, betas, isLinkedToWorkspace]
    )

    const sortedPinnedAndGBRReports = useMemo(
        () => sortReports(ids.pinnedOrGBRReportsIDs),
        [sortReports, ids.pinnedOrGBRReportsIDs]
    );

    const sortedDraftReports = useMemo(
        () => sortReports(ids.draftReportsIDs),
        [sortReports, ids.draftReportsIDs]
    );

    const sortedArchivedReports = useMemo(
        () => ids.archivedReportsIDs.split(',')
            .map(id => {
                const report = allReports[`report_${id}`];
                const shouldDisplay = report && isReportAvailable(report) && ReportUtils.canAccessReport(report, policies, betas)

                if(!shouldDisplay){
                    return null
                }

                if(currentActiveReportId){
                    const lastVisibleMessage = ReportActionsUtils.getLastVisibleMessage(report.reportID);
                    const isEmptyChat = !report.lastMessageText && !report.lastMessageTranslationKey && !lastVisibleMessage.lastMessageText && !lastVisibleMessage.lastMessageTranslationKey;
                    const canHideReport = ReportUtils.shouldHideReport(report, currentActiveReportId);

                    if(ReportUtils.isChatThread(report) && canHideReport && isEmptyChat){
                        return null
                    }
                }

                const shouldShow = isInGSDMode ? ReportUtils.isUnread(report) && report.notificationPreference !== CONST.REPORT.NOTIFICATION_PREFERENCE.MUTE : !isInGSDMode;
      
                return shouldShow ? report : null
            })
            .filter(report => report && isLinkedToWorkspace(report))
            .sort((a, b) => (!isInGSDMode ? compareReportDates(b, a) : compareReportNames(a, b)))
            .map((report) => report?.reportID)
        ,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [betas, currentActiveReportId, ids.archivedReportsIDs, isInGSDMode, policies, isLinkedToWorkspace],
    );
    // const sortedDraftReports = useMemo(() => draftReports.sort(compareReportNames).map((report) => report.reportID), [draftReports]);

    const sortedNonArchivedReports = useMemo(
        () => {
            const start = performance.now();
            const r = reportsToDisplay
        .sort((a, b) => (!isInGSDMode && compareReportDates(b, a)) || compareReportNames(a, b))
        .map((report) => report.reportID)
        const end = performance.now();
        console.log(`Execution time: sortedNonArchivedReports: ${end - start} ms`);
        return r;
    },
        [isInGSDMode, reportsToDisplay],
    );
    // const sortedArchivedReports = useMemo(
    //     () => archivedReports.sort((a, b) => (!isInGSDMode ? compareReportDates(b, a) : compareReportNames(a, b))).map((report) => report.reportID),
    //     [archivedReports, isInGSDMode],
    // );

    useEffect(() => {
        // Now that we have all the reports grouped and sorted, they must be flattened into an array and only return the reportID.
        // The order the arrays are concatenated in matters and will determine the order that the groups are displayed in the sidebar.
        const reportIDs = [...sortedPinnedAndGBRReports, ...sortedDraftReports, ...sortedNonArchivedReports, ...sortedArchivedReports];

        if (reportIDsRef.current.join(',') === reportIDs.join(',')) {
            return;

        }
        reportIDsRef.current = reportIDs;
    }, [sortedArchivedReports, sortedDraftReports, sortedNonArchivedReports, sortedPinnedAndGBRReports]);

    return reportIDsRef.current.length > 0 ? reportIDsRef.current : null;
};

export default useOrderedReportIDs;
