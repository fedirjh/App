import {Keyboard, View, PanResponder, InteractionManager} from 'react-native';
import React from 'react';
import _ from 'underscore';
import lodashGet from 'lodash/get';
import {PickerAvoidingView} from 'react-native-picker-select';
import KeyboardAvoidingView from '../KeyboardAvoidingView';
import CONST from '../../CONST';
import styles from '../../styles/styles';
import HeaderGap from '../HeaderGap';
import OfflineIndicator from '../OfflineIndicator';
import compose from '../../libs/compose';
import withNavigation from '../withNavigation';
import {withNetwork} from '../OnyxProvider';
import {propTypes, defaultProps} from './propTypes';
import SafeAreaConsumer from '../SafeAreaConsumer';
import TestToolsModal from '../TestToolsModal';
import withKeyboardState from '../withKeyboardState';
import withWindowDimensions from '../withWindowDimensions';
import withEnvironment from '../withEnvironment';
import withNavigationFocus from '../withNavigationFocus';
import toggleTestToolsModal from '../../libs/actions/TestTool';
import CustomDevMenu from '../CustomDevMenu';
import * as Browser from '../../libs/Browser';
import * as DeviceCapabilities from '../../libs/DeviceCapabilities';

class ScreenWrapper extends React.Component {
    constructor(props) {
        super(props);

        this.panResponder = PanResponder.create({
            onStartShouldSetPanResponderCapture: (e, gestureState) => gestureState.numberActiveTouches === CONST.TEST_TOOL.NUMBER_OF_TAPS,
            onPanResponderRelease: toggleTestToolsModal,
        });

        this.keyboardDissmissPanResponder = PanResponder.create({
            onMoveShouldSetPanResponderCapture: (e, gestureState) => {
                const isHorizontalSwipe = Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
                const shouldDismissKeyboard = this.props.shouldDismissKeyboardBeforeClose && this.props.isKeyboardShown && Browser.isMobile();
                return isHorizontalSwipe && shouldDismissKeyboard;
            },
            onPanResponderGrant: Keyboard.dismiss,
        });
        this.state = {
            didScreenTransitionEnd: false,
            canUseTouchScreen: DeviceCapabilities.canUseTouchScreen(),
        };

        if (this.state.canUseTouchScreen && this.props.shouldEnableLockHeightWhileNavigate) {
            this.state.initalKeyboardAvoidingMinHeight = undefined;
            this.state.minHeight = props.initialWindowHeight;
            this.state.isKeyboardCompletelyClosed = false;
            this.state.didInteractionsComplete = false;
        }
    }

    static getDerivedStateFromProps(props, state) {
        if (!props.isFocused && state.canUseTouchScreen && props.shouldEnableLockHeightWhileNavigate) {
            return {minHeight: props.initialWindowHeight, isKeyboardCompletelyClosed: false, didInteractionsComplete: false};
        }

        // Restore min-height to allow floating button when keyboard appeared
        if (
            state.canUseTouchScreen &&
            props.shouldEnableLockHeightWhileNavigate &&
            props.isFocused &&
            // keyboardHeight is for native device. Native device doesn't resize windowHeight when keyboard shown
            props.windowHeight - props.keyboardHeight === props.initialWindowHeight
        ) {
            return {isKeyboardCompletelyClosed: true, minHeight: state.initalKeyboardAvoidingMinHeight};
        }

        return null;
    }

    componentDidMount() {
        this.unsubscribeTransitionEnd = this.props.navigation.addListener('transitionEnd', (event) => {
            // Prevent firing the prop callback when user is exiting the page.
            if (lodashGet(event, 'data.closing')) {
                return;
            }
            this.setState({didScreenTransitionEnd: true});
            this.props.onEntryTransitionEnd();
        });

        // We need to have this prop to remove keyboard before going away from the screen, to avoid previous screen look weird for a brief moment,
        // also we need to have generic control in future - to prevent closing keyboard for some rare cases in which beforeRemove has limitations
        // described here https://reactnavigation.org/docs/preventing-going-back/#limitations
        if (this.props.shouldDismissKeyboardBeforeClose) {
            this.beforeRemoveSubscription = this.props.navigation.addListener('beforeRemove', () => {
                if (!this.props.isKeyboardShown) {
                    return;
                }
                Keyboard.dismiss();
            });
        }
    }

    /**
     * We explicitly want to ignore if props.modal changes, and only want to rerender if
     * any of the other props **used for the rendering output** is changed.
     * @param {Object} nextProps
     * @param {Object} nextState
     * @returns {boolean}
     */
    shouldComponentUpdate(nextProps, nextState) {
        return !_.isEqual(this.state, nextState) || !_.isEqual(_.omit(this.props, 'modal'), _.omit(nextProps, 'modal'));
    }

    componentDidUpdate() {
        if (!this.props.isFocused || this.state.didInteractionsComplete) {
            return;
        }

        InteractionManager.runAfterInteractions(() => {
            this.setState({didInteractionsComplete: true});
        });
    }

    componentWillUnmount() {
        if (this.unsubscribeTransitionEnd) {
            this.unsubscribeTransitionEnd();
        }
        if (this.beforeRemoveSubscription) {
            this.beforeRemoveSubscription();
        }
    }

    render() {
        const maxHeight = this.props.shouldEnableMaxHeight ? this.props.windowHeight : undefined;

        return (
            <SafeAreaConsumer>
                {({insets, paddingTop, paddingBottom, safeAreaPaddingBottomStyle}) => {
                    const paddingStyle = {};

                    if (this.props.includePaddingTop) {
                        paddingStyle.paddingTop = paddingTop;
                    }

                    // We always need the safe area padding bottom if we're showing the offline indicator since it is bottom-docked.
                    if (this.props.includeSafeAreaPaddingBottom || this.props.network.isOffline) {
                        paddingStyle.paddingBottom = paddingBottom;
                    }

                    // we should also calculate vertical padding and vertical insets to minHeight
                    const verticalPadding = paddingStyle.paddingTop || 0 + paddingStyle.paddingBottom || 0;
                    const verticalInsets = insets.top + insets.bottom;
                    const minHeight =
                        this.state.minHeight === undefined || !this.state.canUseTouchScreen || !this.props.shouldEnableLockHeightWhileNavigate
                            ? undefined
                            : this.state.minHeight - verticalPadding - verticalInsets;

                    return (
                        <View
                            style={styles.flex1}
                            // eslint-disable-next-line react/jsx-props-no-spreading
                            {...(this.props.environment === CONST.ENVIRONMENT.DEV ? this.panResponder.panHandlers : {})}
                            testID={this.props.testID}
                        >
                            <View
                                style={[styles.flex1, paddingStyle, ...this.props.style]}
                                // eslint-disable-next-line react/jsx-props-no-spreading
                                {...this.keyboardDissmissPanResponder.panHandlers}
                            >
                                <KeyboardAvoidingView
                                    style={[styles.w100, styles.h100, {maxHeight, minHeight}]}
                                    behavior={this.props.keyboardAvoidingViewBehavior}
                                    enabled={
                                        this.props.shouldEnableKeyboardAvoidingView &&
                                        (!this.state.canUseTouchScreen || !this.props.shouldEnableLockHeightWhileNavigate
                                            ? true
                                            : this.state.didInteractionsComplete && this.state.isKeyboardCompletelyClosed)
                                    }
                                >
                                    <PickerAvoidingView
                                        style={styles.flex1}
                                        enabled={this.props.shouldEnablePickerAvoiding}
                                    >
                                        <HeaderGap styles={this.props.headerGapStyles} />
                                        {this.props.environment === CONST.ENVIRONMENT.DEV && <TestToolsModal />}
                                        {this.props.environment === CONST.ENVIRONMENT.DEV && <CustomDevMenu />}
                                        {
                                            // If props.children is a function, call it to provide the insets to the children.
                                            _.isFunction(this.props.children)
                                                ? this.props.children({
                                                      insets,
                                                      safeAreaPaddingBottomStyle,
                                                      didScreenTransitionEnd: this.state.didScreenTransitionEnd,
                                                  })
                                                : this.props.children
                                        }
                                        {this.props.isSmallScreenWidth && this.props.shouldShowOfflineIndicator && <OfflineIndicator style={this.props.offlineIndicatorStyle} />}
                                    </PickerAvoidingView>
                                </KeyboardAvoidingView>
                            </View>
                        </View>
                    );
                }}
            </SafeAreaConsumer>
        );
    }
}

ScreenWrapper.propTypes = propTypes;
ScreenWrapper.defaultProps = defaultProps;

export default compose(withNavigation, withNavigationFocus, withEnvironment, withWindowDimensions, withKeyboardState, withNetwork())(ScreenWrapper);
