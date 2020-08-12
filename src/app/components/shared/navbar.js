import PropTypes from 'prop-types';
import React from 'react';
import { connect } from 'react-redux';
import { Button } from './buttons';
import Localize from './localize';
import Logo from './logo';
import IconSend from './icon-send';
import IconReceive from './icon-receive';
import * as appActions from '../../actions/app-actions';

const Spacer = () => {
  return (
    <div style={{flexGrow: 1}} />
  );
};

let Navbar = ({ windowWidth, showReceiveModal, showSendModal }) => {

  const showButtonText = windowWidth > 738;

  return (
    <div className={'lw-navbar-container'}>
      <Logo className={'lw-navbar-logo'} />
      <Spacer />
      <Button title={Localize.text('Send', 'navbar')} onClick={showSendModal}>{showButtonText ? Localize.text('Send', 'navbar') + ' ' : null}<IconSend className={'navbar-button-svg-icon'} /></Button>
      <Button title={Localize.text('Receive', 'navbar')} onClick={showReceiveModal}>{showButtonText ? Localize.text('Receive', 'navbar') + ' ' : null}<IconReceive className={'navbar-button-svg-icon'} /></Button>
    </div>
  );
};
Navbar.propTypes = {
  windowWidth: PropTypes.number,
  showReceiveModal: PropTypes.func,
  showSendModal: PropTypes.func
};
Navbar = connect(
  ({ appState }) => ({
    windowWidth: appState.windowWidth
  }),
  dispatch => ({
    showReceiveModal: () => dispatch(appActions.setShowReceiveModal(true)),
    showSendModal: () => dispatch(appActions.setShowSendModal(true)),
  })
)(Navbar);

export {
  Navbar
};