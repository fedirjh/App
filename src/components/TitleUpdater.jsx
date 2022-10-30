// component for updating the title of the page when onyx reports a change
import React from 'react';
import {withOnyx} from 'react-native-onyx';
import PropTypes from 'prop-types';
import _ from 'underscore';
import ONYXKEYS from '../ONYXKEYS';
import * as ReportUtils from '../libs/ReportUtils';
import updateUnread from '../libs/UnreadIndicatorUpdater/updateUnread';

const propTypes = {
    // eslint-disable-next-line react/forbid-prop-types,react/require-default-props
    reports: PropTypes.any,
};

class TitleUpdater extends React.Component {
    // eslint-disable-next-line no-useless-constructor
    constructor(props) {
        super(props);

        this.state = {
            unreadCount: -1,
        };
    }

    componentDidMount() {
        console.log('TitleUpdater mounted');
        console.log(this.props.reports);
        this.updateTitle();
    }

    componentDidUpdate(prevProps) {
        if (prevProps.reports === this.props.reports) {
            console.log(this.state.unreadCount);
            return;
        }
        _.throttle(() => {
            console.log('TitleUpdater updated');
            console.log(this.props.reports);
            this.updateTitle();
        }, 100, {leading: false})();
    }

    componentWillUnmount() {
        console.log('TitleUpdater unmounted');
        updateUnread(0);
        updateUnread(0);
    }
    updateTitle() {
        const unreadReports = _.filter(this.props.reports, ReportUtils.isUnread);
        if (unreadReports.length !== this.state.unreadCount) {
            this.setState({unreadCount: unreadReports.length}, () => updateUnread(this.state.unreadCount));
            console.log('Unread Count');
            console.log(this.state.unreadCount);
        }
    }

    render() {
        return null;
    }
}

TitleUpdater.propTypes = propTypes;
export default withOnyx({
    reports: {
        key: ONYXKEYS.COLLECTION.REPORT,
    },
})(TitleUpdater);
