import _ from 'underscore';
import Onyx from 'react-native-onyx';
import ONYXKEYS from '../../ONYXKEYS';
import updateUnread from './updateUnread';
import * as ReportUtils from '../ReportUtils';

let reports = {};

/**
 * Updates the title and favicon of the current browser tab and Mac OS or iOS dock icon with an unread indicator.
 * Note: We are throttling this since listening for report changes can trigger many updates depending on how many reports
 * a user has and how often they are updated.
 */
const throttledUpdatePageTitleAndUnreadCount = _.throttle(() => {
    // eslint-disable-next-line no-console
    console.log('update title on report change');
    console.log(reports);
    // eslint-disable-next-line no-console
    const totalCount = _.keys(reports).length;
    updateUnread(totalCount);
}, 100, {leading: false});

let connectionID;

/**
 * Bind to the report collection key and update
 * the title and unread count indicators
 */
function listenForReportChanges() {
    connectionID = Onyx.connect({
        key: ONYXKEYS.COLLECTION.REPORT,
        callback: (report, key) => {
            console.log('report change');
            if (!key) {
                return;
            }

            // eslint-disable-next-line no-console
            // console.log(reports);

            // let totalCount = _.keys(reports).length

            /* if (ReportUtils.isUnread(report)) {
                reports[key] = report;
            } else if (reports[key]) {
                reports[key] = null;
            }
*/
            if (!!report && ReportUtils.isUnread(report)) {
                reports[key] = report;
            } else if (reports[key]) {
                delete reports[key];
            }

            // else if (ReportUtils.isUnread(report)) { reports[key] = report;}
            // else { delete reports[key];}

            // if(totalCount !== _.keys(reports).length)
            // reports[key] = report; // ? ReportUtils.isUnread(report) : null;
            throttledUpdatePageTitleAndUnreadCount();
        },
    });
}

/**
 * Remove the subscription callback when we no longer need it.
 */
function stopListeningForReportChanges() {
    if (!connectionID) {
        return;
    }

    // updateUnread(0);
    console.log('stop listening for report changes');
    Onyx.disconnect(connectionID);
}

/**
 * Add a report to the unread list
 * @param key
 */
function addToUnread(key) {
    reports[key] = true;
    throttledUpdatePageTitleAndUnreadCount();
}

/**
 * Remove a report from the unread list
 * @param key
 */
function removeFromUnread(key) {
    if (!reports[key]) {
        return;
    }
    delete reports[key];
    throttledUpdatePageTitleAndUnreadCount();
}

/**
 * Clear the unread list and update the title and favicon
 */
function resetUnread() {
    reports = {};
    throttledUpdatePageTitleAndUnreadCount();
}

export default {
    listenForReportChanges,
    addToUnread,
    resetUnread,
    removeFromUnread,
    stopListeningForReportChanges,
    throttledUpdatePageTitleAndUnreadCount,
};
