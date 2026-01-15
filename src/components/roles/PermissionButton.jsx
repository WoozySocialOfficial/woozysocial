import { useWorkspace } from '../../contexts/WorkspaceContext';
import { Button, Tooltip } from '@chakra-ui/react';

/**
 * PermissionButton Component
 *
 * A button that checks permissions before allowing interaction.
 * Automatically disables and shows tooltip when permission is denied.
 *
 * @param {string} permission - Permission name required (e.g., 'canManageTeam')
 * @param {string[]} allowedRoles - Array of roles allowed (e.g., ['owner', 'admin'])
 * @param {Function} onClick - Click handler
 * @param {string} deniedMessage - Tooltip message when permission is denied
 * @param {ReactNode} children - Button content
 * @param {object} rest - Additional Button props
 */
const PermissionButton = ({
  permission = null,
  allowedRoles = null,
  onClick,
  deniedMessage = 'You do not have permission to perform this action',
  children,
  ...rest
}) => {
  const { userRole, hasRolePermission } = useWorkspace();

  // Determine if user has access
  let hasAccess = false;

  if (permission) {
    hasAccess = hasRolePermission(permission);
  } else if (allowedRoles && allowedRoles.length > 0) {
    hasAccess = allowedRoles.includes(userRole);
  } else {
    hasAccess = true;
  }

  // If user has access, render normal button
  if (hasAccess) {
    return (
      <Button onClick={onClick} {...rest}>
        {children}
      </Button>
    );
  }

  // User doesn't have access - show disabled button with tooltip
  return (
    <Tooltip label={deniedMessage} placement="top">
      <Button isDisabled cursor="not-allowed" {...rest}>
        {children}
      </Button>
    </Tooltip>
  );
};

export default PermissionButton;
